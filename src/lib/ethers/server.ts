import express, { Express } from 'express'
import cors from 'cors'
import { ethers, Wallet } from 'ethers'

import { logger, traceKeyValue } from '../Logger'
import { WalletWrapper } from './wrapper'

/**
 * Leverages `JsonRpcEngine` to intercept account-related calls, and pass any other calls down to a destination
 * provider, e.g. Infura.
 */
class WalletMiddlewareServer {
  alwaysSynced: boolean
  expressServer: Express
  mockFilters: boolean
  privateKeys?: string[]
  seedPhrase?: string
  seedPhraseWallets: number
  wrapper: WalletWrapper

  constructor (
    seed_phrase: string,
    seed_phrase_wallets: number,
    private_keys: string[],
    interleave_blocks: number,
    gas_price: number,
    gas_limit: number,
    estimate_gas_limit: boolean,
    estimate_gas_price: boolean,
    always_synced: boolean,
    mock_filters: boolean,
    gas_price_factor: number,
    gas_limit_factor: number,
    force_eip_155: boolean,
    force_eip_1559: boolean,
    eth_gas_price_factor: boolean,
    provider?: ethers.providers.JsonRpcProvider
  ) {
    this.alwaysSynced = always_synced
    this.expressServer = express()
    this.mockFilters = mock_filters
    this.privateKeys = private_keys
    this.seedPhrase = seed_phrase
    this.seedPhraseWallets = seed_phrase_wallets
    this.wrapper = new WalletWrapper(
      interleave_blocks,
      gas_price,
      gas_limit,
      estimate_gas_limit,
      estimate_gas_price,
      gas_price_factor,
      gas_limit_factor,
      force_eip_155,
      force_eip_1559,
      eth_gas_price_factor
    )
    if (provider) {
      this.wrapper.provider = provider
    }
    // trace configuration
    let lines = [
      [
        'Gas Price',
        `${gas_price} ${estimate_gas_price ? '(max)' : '(default)'}`
      ],
      [
        'Gas limit',
        `${gas_limit} ${estimate_gas_limit ? '(max)' : '(default)'}`
      ]
    ]
    if (gas_price_factor > 1) {
      lines = [...lines, ['Gas price factor', `x ${gas_price_factor}`]]
    }
    if (gas_limit_factor > 1) {
      lines = [...lines, ['Gas limit factor', `x ${gas_limit_factor}`]]
    }
    if (interleave_blocks > 0) {
      lines = [...lines, ['Interleave blocks', interleave_blocks.toString()]]
    }
    traceKeyValue('Config', lines)
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
        const body = req.body
        const socket = {
          clientAddr: req.connection.remoteAddress,
          clientPort: req.connection.remotePort,
          clientId: body.id,
          serverId: this.wrapper.provider._nextId
        }

        const requests = Array.isArray(body) ? [ ...body ] : [ body ]
        Promise.all(requests.map(async request => {
          logger.log({
            level: 'info',
            socket,
            message: `>> ${request.method}`
          })

          let handlers: { [K: string]: any } = {
            eth_accounts: this.wrapper.getAccounts,
            eth_call: this.wrapper.processEthCall,
            eth_chainId: this.wrapper.getNetwork,
            eth_estimateGas: this.wrapper.processEthEstimateGas,
            eth_gasPrice: this.wrapper.processEthGasPrice,
            eth_getBlockByNumber: this.wrapper.getBlockByNumber,
            eth_sendTransaction: this.wrapper.processTransaction,
            eth_sign: this.wrapper.processEthSignMessage,
          }
          if (this.alwaysSynced) {
            handlers = {
              ...handlers,
              eth_syncing: () => false
            }
          }
          if (this.mockFilters) {
            handlers = {
              ...handlers,
              eth_getFilterChanges: this.wrapper.mockEthFilterChanges,
              eth_newBlockFilter: () => '0x1'
            }
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
            if (request.method in handlers) {
              result = await handlers[request.method].bind(this.wrapper)(
                socket,
                ...(request.params || [])
              )
            } else {
              result = await this.wrapper.provider.send(
                request.method,
                request.params
              )
            }
            response = { ...header, result }
          } catch (exception: any) {
            if (!exception.code) {
              // if no error code is specified,
              //   assume the provider is actually reporting an execution error:
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
                message: `<= Invalid JSON: ${body}`
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
          return response
        })).then((responses: any[]) => {
          if (responses.length === 1) {
            res.status(200).json(...responses)
          } else {
            res.status(200).json(responses)
          }
        })
      },
    )
    return this
  }

  async traceWallet (index: number, wallet: Wallet) {
    traceKeyValue(`Signer #${index}`, [
      ['Address', await wallet.getAddress()],
      ['Balance', await wallet.getBalance()],
      ['Nonce  ', await wallet.getTransactionCount()]
    ])
  }

  /**
   * Tells the Express server to start listening.
   */
  async listen (port: number, hostname?: string) {
    try {
      // initialize the RPC provider
      await this.wrapper.provider.ready
      let network: ethers.providers.Network =
        await this.wrapper.provider.detectNetwork()
      if (network) {
        traceKeyValue('Network', [
          ['Network id', network.chainId],
          ['Network name', network.name],
          ['ENS address', network.ensAddress]
        ])
      }

      // Connect seed phrase wallet addresses to the rpc provider:
      let wix = 0
      if (this.seedPhrase) {
        for (let ix = 0; ix < this.seedPhraseWallets || 0; ix++) {
          const wallet = Wallet.fromMnemonic(
            this.seedPhrase,
            `m/44'/60'/0'/0/${ix}`
          ).connect(this.wrapper.provider)
          this.wrapper.wallets.push(wallet)
          await this.traceWallet(wix++, wallet)
        }
        delete this.seedPhrase
      }
      // Connect seed phrase wallet addresses to the rpc provider:
      if (
        this.privateKeys &&
        Array.isArray(this.privateKeys) &&
        this.privateKeys.length > 0
      ) {
        for (let ix = 0; ix < this.privateKeys?.length; ix++) {
          const wallet = new Wallet(this.privateKeys[ix], this.wrapper.provider)
          this.wrapper.wallets.push(wallet)
          await this.traceWallet(wix++, wallet)
        }
        delete this.privateKeys
      }
    } catch (e) {
      console.error('Cannot get the HTTP server running !!!')
      console.error(e)
      process.exit(-1)
    }

    traceKeyValue('Listening', [
      ['TCP/host', hostname || '0.0.0.0'],
      ['TCP/port', port],
      ['Log level', logger.level.toUpperCase()]
    ])

    this.expressServer.listen(port, hostname || '0.0.0.0')
    return this
  }
}

export { WalletMiddlewareServer }
