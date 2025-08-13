import express, { Express } from 'express'
import cors from 'cors'

import { ethers } from 'ethers'
import { logger, SocketParams, traceKeyValue } from '../Logger'
import { WalletWrapper } from './wrapper'

/**
 * Leverages `JsonRpcEngine` to intercept account-related calls, and pass any other calls down to a destination
 * provider, e.g. Infura.
 */
export class WalletMiddlewareServer {
  expressServer: Express
  rpcMethodHandlers: { [K: string]: any }
  totalRequests: number
  wrapper: WalletWrapper

  constructor (
    rpcUrl: string,
    graphUrl: string,
    seedPhrase: string,
    numAddresses: number
  ) {
    this.expressServer = express()
    this.totalRequests = 0
    this.wrapper = new WalletWrapper(rpcUrl, graphUrl, seedPhrase, numAddresses)

    this.rpcMethodHandlers = {
      eth_accounts: this.wrapper.getAccounts,
      eth_blockNumber: this.wrapper.getBlockNumber,
      eth_call: this.wrapper.call,
      eth_chainId: this.wrapper.getNetVersion,
      eth_estimateGas: this.wrapper.estimateGas,
      eth_gasPrice: this.wrapper.estimateGasPrice,
      eth_getBalance: this.wrapper.getBalance,
      eth_getBlockByNumber: this.wrapper.getBlockByNumber,
      eth_getCode: this.wrapper.getCode,
      eth_getFilterChanges: this.wrapper.mockGetFilterChanges,
      eth_getTransactionByHash: this.wrapper.getTransactionByHash,
      eth_getTransactionReceipt: this.wrapper.getTransactionReceipt,
      eth_newBlockFilter: this.wrapper.mockCreateBlockFilter,
      eth_sendTransaction: this.wrapper.sendTransaction,
      eth_syncing: this.wrapper.getSyncingStatus,
      net_version: this.wrapper.getNetVersion,
      web3_clientVersion: this.wrapper.getWeb3Version
    }

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
          clientId: request.id,
          serverId: ++this.totalRequests
        }
        let method = request.method
        logger.log({ level: 'info', socket, message: `>> ${method}` })

        // Debug trace params, if any
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
          // Intercept method call, if required:
          if (request.method in this.rpcMethodHandlers) {
            result = await this.rpcMethodHandlers[request.method].bind(
              this.wrapper
            )(socket, ...(request.params || []))
          } else {
            const reason = `Unsupported ${request.method}`
            throw {
              reason,
              body: {
                code: -32699,
                message: reason
              }
            }
          }
          response = { ...header, result }
        } catch (exception: any) {
          if (!exception.code) {
            // if no error code is specified,
            //   assume the Reef provider is actually reporting an execution error:
            exception = {
              reason: exception.toString(),
              body: {
                error: {
                  code: -32015,
                  message: exception.toString()
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
                  message: `"${message}"`
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
    await this.wrapper.setup()
    const network = await this.wrapper.provider.getNetwork()
    traceKeyValue('Reef provider', [
      ['Chain id', network.chainId],
      ['Chain name', network.name],
      ['Node name', await this.wrapper.provider.api.rpc.system.name()],
      ['Node version', await this.wrapper.provider.api.rpc.system.version()]
    ])

    this.wrapper.signers.forEach(async (signer, index) => {
      traceKeyValue(`Reef wallet #${index + 1}`, [
        ['Address   ', await signer.getAddress()],
        [
          'Balance   ',
          `${ethers.utils.formatEther(await signer.getBalance())} REEF`
        ],
        ['Nonce     ', await signer.getTransactionCount()]
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
}
