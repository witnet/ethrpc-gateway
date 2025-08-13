import express, { Express } from 'express'
import cors from 'cors'
import { Conflux, Transaction, format as confluxFormat } from 'js-conflux-sdk'
import { ethers } from 'ethers'
import { logger, SocketParams, traceKeyValue } from '../Logger'
import { WalletWrapper } from './wrapper'

interface WalletWrapperInfo {
  accumulatedInterestReturn: string
  address: string
  admin: string
  balance: string
  codeHash: string
  collateralForStorage: string
  nonce: string
  stakingBalance: string
}

/**
 * Leverages `JsonRpcEngine` to intercept account-related calls, and pass any other calls down to a destination
 * provider, e.g. Infura.
 */
export class WalletMiddlewareServer {
  expressServer: Express
  wrapper: WalletWrapper

  dictionaryEthCfx: { [K: string]: string } = {
    eth_blockNumber: 'cfx_epochNumber',
    eth_call: 'cfx_call',
    eth_gasPrice: 'cfx_gasPrice',
    eth_getBalance: 'cfx_getBalance',
    eth_getBlockByHash: 'cfx_getBlockByHash',
    eth_getBlockByNumber: 'cfx_getBlockByEpochNumber',
    eth_getCode: 'cfx_getCode',
    eth_getLogs: 'cfx_getLogs',
    eth_getStorageAt: 'cfx_getStorageAt',
    eth_getTransactionByHash: 'cfx_getTransactionByHash',
    eth_getTransactionCount: 'cfx_getNextNonce',
    eth_getTransactionReceipt: 'cfx_getTransactionReceipt'
  }

  rpcMethodHandlers: { [K: string]: any }
  rpcParamsHandlers: { [K: string]: any }

  constructor (
    url: string,
    networkId: number,
    privateKeys: string[],
    interleaveEpochs: number,
    defaultGas: BigInt,
    defaultGasPrice: number,
    estimateGasPrice: boolean,
    epochLabel: string,
    alwaysSynced: boolean
  ) {
    this.expressServer = express()

    this.wrapper = new WalletWrapper(
      networkId,
      privateKeys,
      interleaveEpochs,
      defaultGas,
      estimateGasPrice,
      epochLabel,
      alwaysSynced,
      new Conflux({ url, networkId, defaultGasPrice })
    )

    this.rpcParamsHandlers = {
      eth_call: this.paramsTranslateTxAndTag,
      eth_estimateGas: this.paramsTranslateTxAndTag,
      eth_getCode: this.paramsTranslateAddrAndTag,
      eth_getBalance: this.paramsTranslateAddrAndTag,
      eth_getBlockByNumber: this.paramsTranslateTag,
      eth_getTransactionCount: this.paramsTranslateAddrAndTag,
      eth_sendTransaction: this.paramsTranslateTxAndTag,
      eth_sign: this.paramsTranslateAddress
    }

    this.rpcMethodHandlers = {
      cfx_call: this.wrapper.call,
      eth_estimateGas: this.wrapper.estimateGas,
      cfx_sendTransaction: this.wrapper.processTransaction,
      eth_accounts: this.wrapper.getAccounts,
      eth_chainId: this.wrapper.processChainId,
      eth_getFilterChanges: this.wrapper.getEthFilterChanges,
      eth_newBlockFilter: this.wrapper.createEthBlockFilter,
      eth_sendTransaction: this.wrapper.processTransaction,
      eth_sign: this.wrapper.processEthSignMessage,
      eth_syncing: this.wrapper.getSyncingStatus,
      eth_uninstallFilter: this.wrapper.uninstallEthFilter,
      net_version: this.wrapper.getNetworkId
    }

    traceKeyValue('Conflux provider', [
      ['Network id       ', networkId],
      ['Provider URL     ', url],
      ['Def. gas limit   ', defaultGas],
      [
        'Def. gas price    ',
        estimateGasPrice ? '(self-estimated)' : defaultGasPrice
      ],
      ['Def. epoch tag   ', epochLabel],
      ['Epochs interleave', interleaveEpochs]
    ])

    return this
  }

  /**
   * Initializes the Express server, configures CORS, and passes requests back and forth between the Express server and
   * the `JsonRpcEngine`.
   */
  initialize () {
    this.expressServer.use(cors())
    this.expressServer.use(express.json())

    this.expressServer.post(
      '/{*any}',
      async (req: express.Request, res: express.Response) => {
        const request = req.body

        const socket: SocketParams = {
          clientAddr: req.connection.remoteAddress || 'unknownAddr',
          clientPort: req.connection.remotePort || 0,
          clientId: request.id % 10000,
          serverId:
            parseInt('0x' + this.wrapper.conflux.provider.requestId()) % 10000
        }

        let method = request.method

        if (method in this.dictionaryEthCfx) {
          request.method = this.dictionaryEthCfx[request.method]
          logger.log({
            level: 'info',
            socket,
            message: `>> ${method} >> ${request.method}`
          })
        } else {
          logger.log({ level: 'info', socket, message: `>> ${method}` })
        }
        if (request.params && request.params.length > 0) {
          logger.log({
            level: 'debug',
            socket,
            message: `> ${JSON.stringify(request.params)}`
          })
        }

        const header = {
          jsonrpc: request.jsonrpc,
          id: request.id
        }

        let response: {
          id: number
          jsonrpc: string
          result?: string
          error?: string
        }
        let result

        try {
          if (method in this.rpcParamsHandlers) {
            request.params = await this.rpcParamsHandlers[method].bind(this)(
              request.params,
              socket
            )
          }

          if (request.method in this.rpcMethodHandlers) {
            result = await this.rpcMethodHandlers[request.method].bind(
              this.wrapper
            )(...(request.params || []), socket)
          } else {
            if (request.method.startsWith('eth_')) {
              const reason = `Unhandled method '${request.method}'`
              throw {
                reason,
                body: {
                  error: {
                    code: -32601,
                    message: reason
                  }
                }
              }
            }
            result = await this.wrapper.send(request.method, request.params)
          }

          response = { ...header, result }
        } catch (exception: any) {
          if (!exception.code) {
            // if no error code is specified,
            //   assume the Conflux provider is actually reporting an execution error:
            exception = {
              reason: exception.toString(),
              body: {
                error: {
                  code: -32015,
                  message: exception.data
                    ? 'Execution error'
                    : JSON.stringify(exception),
                  data: exception.data
                }
              }
            }
          }
          const message =
            exception.reason ||
            (exception.error && exception.error.reason) ||
            exception ||
            'null exception'
          let body =
            exception.body ||
            (exception.error && exception.error.body
              ? exception.error.body
              : {
                error: {
                  code: exception.code || -32099,
                  message: `"${message}"`,
                  data: exception.data
                }
              })
          body = typeof body !== 'string' ? JSON.stringify(body) : body
          try {
            response = { ...header, error: JSON.parse(body).error }
          } catch (e) {
            logger.log({
              level: 'error',
              socket,
              message: `<= Invalid JSON response: "${body}"`
            })
            response = {
              ...header,
              error: `{ "code": -32700, "message": "Invalid JSON response" }`
            }
          }
        }
        if (response.error) {
          logger.log({
            level: 'warn',
            socket,
            message: `<= Error: ${JSON.stringify(response.error)}`
          })
        } else {
          if (
            method.startsWith('eth_') &&
            result &&
            typeof result === 'object'
          ) {
            result = this.translateCfxResponseObject(result, socket)
          }
          logger.log({
            level: 'http',
            socket,
            message: `<< ${JSON.stringify(result)}`
          })
        }
        res.status(200).json(response)
      }
    )
    return this
  }

  /**
   * Tells the Express server to start listening.
   */
  async listen (port: number, hostname?: string) {
    let info
    this.wrapper.getAccounts().forEach(async (address, count) => {
      try {
        info = (await this.wrapper.getAccountInfo(address)) as WalletWrapperInfo
      } catch (e) {
        console.error(
          'Service provider seems to be down or rejecting connections !!!'
        )
        console.error(e)
        process.exit(-1)
      }
      traceKeyValue(`Conflux wallet #${count++}`, [
        ['Address   ', address],
        ['Admin     ', info.admin?.toLowerCase()],
        ['Balance   ', `${ethers.utils.formatEther(info.balance)} CFX`],
        [
          'Collateral',
          `${ethers.utils.formatEther(info.collateralForStorage)} CFX`
        ],
        ['Nonce     ', info.nonce]
      ])
    })

    console.log(
      `Listening on ${
        hostname || '0.0.0.0'
      }:${port} [${logger.level.toUpperCase()}]`
    )
    console.log()

    this.expressServer.listen(port, hostname || '0.0.0.0')

    return this
  }

  /**
   * Translate to Conflux the ADDRESS value
   *   that come as first parameter in some Eth methods.
   *   E.g.: eth_sign
   */
  paramsTranslateAddress (params: any[], socket: SocketParams) {
    if (params.length > 0) {
      // The ADDRESS is expected as first parameter, and must
      // be converted into proper Conflux alphanumeric format.
      // See: https://github.com/Conflux-Chain/CIPs/blob/master/CIPs/cip-37.md
      params[0] = this.translateEthAddress(params[0])
    }
    return this.traceParams(params, socket)
  }

  /**
   * Translate to Conflux the ADDRESS and TAG parameters
   *   that come as first and second parameter in some Eth methods.
   *   E.g.:
   */
  paramsTranslateAddrAndTag (params: any[], socket: SocketParams) {
    if (params.length > 0) {
      // The ADDRESS is expected as first parameter, and must
      // be converted into proper Conflux alphanumeric format.
      // See: https://github.com/Conflux-Chain/CIPs/blob/master/CIPs/cip-37.md
      params[0] = this.translateEthAddress(params[0])

      if (params.length > 1 && typeof params[1] === 'string') {
        // The TAG parameter is optional. If specified,
        // tag comes in second position as a string.
        params[1] = this.translateTag(params[1])
      }
    }
    return this.traceParams(params, socket)
  }

  /**
   * Translate to Conflux the TAG parameter that (optionally)
   *   comes as first parameter in some Eth methods.
   *   E.g.:
   */
  paramsTranslateTag (params: any[], socket: SocketParams) {
    if (params.length > 0) {
      // TAG as first parameter may be optional in some cases:
      params[0] = this.translateTag(params[0])
    }
    return this.traceParams(params, socket)
  }

  /**
   * Translate to Conflux the TRANSACTION (object) and
   *   TAG (string) that come as first and second
   *   parameters in some Eth methods.
   *   E.g.:
   */
  paramsTranslateTxAndTag (params: any[], socket: SocketParams) {
    if (params.length > 0) {
      if (params[0] && typeof params[0] === 'object') {
        // TRANSACTION parameter must come as an Object:
        params[0] = this.translateEthAddressesInTransaction(params[0])
      }
      if (params.length > 1 && params[1] && typeof params[1] === 'string') {
        // The TAG parameter is optional. If specified,
        // it should come in second position as a string.
        params[1] = this.translateTag(params[1])
      }
    }
    return this.traceParams(params, socket)
  }

  /**
   * Verbosely log incoming parameters.
   */
  traceParams (params: any[], socket: SocketParams) {
    params.forEach((value, index) => {
      logger.verbose({
        socket,
        message: `> [${index}] => ${JSON.stringify(value)}`
      })
    })
    return params
  }

  /**
   * Lambda function to perform actual translation of Eth addresses to Conflux alphanumeric format.
   * See: https://github.com/Conflux-Chain/CIPs/blob/master/CIPs/cip-37.md
   */
  translateEthAddress (address: string) {
    try {
      return confluxFormat.address(address, this.wrapper.networkId)
    } catch (e) {
      const reason = `Unable to translate Eth address '${address}'`
      throw {
        reason,
        body: {
          error: {
            code: -32602, // invalid method parameter(s)
            message: reason
          }
        }
      }
    }
  }

  /**
   * Lambda function to perform actual translation of TAG parameter,
   *   from Eth to Conflux.
   */
  translateTag (tag: string) {
    switch (tag) {
      case 'latest':
        return this.wrapper.epochLabel
      case 'pending':
        return 'latest_checkpoint'
      default:
        return tag
    }
  }

  /**
   * Translate to Conflux the values of `from` and `tx` fields
   *   within passed Transaction object.
   */
  translateEthAddressesInTransaction (tx: Transaction) {
    if (tx.from) tx.from = this.translateEthAddress(tx.from)
    if (tx.to) tx.to = this.translateEthAddress(tx.to)
    return tx
  }

  /**
   * Recursively mutate Conflux response object as to make it readable by Eth clients.
   */
  translateCfxResponseObject (obj: any, socket: SocketParams) {
    const keys = Object.keys(obj)
    keys.forEach(key => {
      let value = obj[key]
      if (typeof value === 'object' && value !== null) {
        // Enters recursion if passed object contains other objects:
        value = this.translateCfxResponseObject(value, socket)
      } else if (typeof value === 'string') {
        // Otherwise, look for Cfx addresses to be transformed...
        if (value.toLowerCase().startsWith('cfx')) {
          // String values within a reponse object starting with "cfx"
          // are considered to be Cfx addresses, that must be
          // converted to hex format:
          obj[key] = confluxFormat.hexAddress(value)
          logger.debug({
            socket,
            message: `< [${key}]: ${value.toLowerCase()} => ${obj[key]}`
          })
        }
      }
      // Some keys in Cfx response object have to either be renamed,
      // or replicated with the equivalent name actually understood by
      // Eth clients:
      switch (key) {
        case 'epochNumber':
          obj['number'] = obj[key]
          obj['blockNumber'] = obj[key]
          break

        case 'index':
          obj['transactionIndex'] = obj[key]
          break

        case 'gasUsed':
          obj['cumulativeGasUsed'] = obj[key]
          break

        case 'contractCreated':
          obj['contractAddress'] = obj[key]
          break

        case 'stateRoot':
          obj['root'] = obj[key]
          break

        case 'logs':
          const logs: Array<Object> = <Array<Object>>obj['logs']
          logs.forEach((_log, index) => {
            obj['logs'][index] = {
              ...obj['logs'][index],
              logIndex: `0x${index.toString(16)}`,
              transactionIndex: obj.transactionIndex,
              transactionHash: obj.transactionHash,
              blockNumber: obj.epochNumber,
              blockHash: obj.blockHash
            }
          })
          break

        case 'status':
        case 'outcomeStatus':
          // In Cfx: "0" => tx ok,     "1" => tx failed (see http://developer.confluxnetwork.org/docs/js-conflux-sdk/docs/javascript_sdk/#confluxprototypegettransactionreceipt)
          // In Eth: "0" => tx failed, "1" => tx ok
          if (obj[key]) {
            if (typeof obj[key] === 'number') {
              obj['status'] = obj[key] == 0 ? 1 : 0
            } else if (typeof obj[key] === 'string') {
              if (obj[key] === '0' || obj[key] === '0x0') obj['status'] = '0x1'
              else obj['status'] = '0x0'
            } else {
              obj['status'] = obj[key]
            }
          }
          // console.log(`Transalating '${key}' to key 'status' and value ${obj["status"]}`)
          break

        default:
      }
    })
    return obj
  }
}
