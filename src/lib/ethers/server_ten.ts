import axios from 'axios'
import { ethers, Wallet } from 'ethers'

import { logger, traceKeyValue } from '../Logger'
import { WalletMiddlewareServer } from './server'

/**
 * Leverages `JsonRpcEngine` to intercept account-related calls, and pass any other calls down to a destination
 * provider, e.g. Infura.
 */
class TenWalletMiddlewareServer extends WalletMiddlewareServer {
  encryptionToken: string
  providerEndpoint: string

  constructor (
    provider_endpoint: string,
    encryption_token: string,
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
    eth_gas_price_factor: boolean
  ) {
    super(
      seed_phrase,
      seed_phrase_wallets,
      private_keys,
      interleave_blocks,
      gas_price,
      gas_limit,
      estimate_gas_limit,
      estimate_gas_price,
      always_synced,
      mock_filters,
      gas_price_factor,
      gas_limit_factor,
      force_eip_155,
      force_eip_1559,
      eth_gas_price_factor
    )
    this.encryptionToken = encryption_token
    this.providerEndpoint = provider_endpoint
    return this
  }

  /**
   * Tells the Express server to start listening.
   */
  async listen (port: number, hostname?: string) {
    try {
      // Join the Ten Gateway by asking for an encryption token
      if (!this.encryptionToken || this.encryptionToken === '') {
        const response = await axios.get(`${this.providerEndpoint}/join/`)
        this.encryptionToken = response.data
      }
      // initialize the RPC provider
      this.wrapper.provider = await new ethers.providers.StaticJsonRpcProvider(
        `${this.providerEndpoint}/?token=${this.encryptionToken}`
      )
      await this.wrapper.provider.ready
      let { data } = await axios.post(`${this.providerEndpoint}/getmessage/`, {
        encryptionToken: this.encryptionToken, 
        formats: ['EIP712']
      }, {
        headers: { "Content-Type": "application/json" },
      })
      const { message } = data
      traceKeyValue('Provider', [
        ['Endpoint', this.providerEndpoint],
        ['Encr. token', this.encryptionToken],
        ['Network id', this.wrapper.provider.network.chainId]
      ])
      // For each private key, connect addtional wallet to the provider and check whether it's already registered:
      if (
        this.privateKeys &&
        Array.isArray(this.privateKeys) &&
        this.privateKeys.length > 0
      ) {
        for (let ix = 0; ix < this.privateKeys?.length; ix++) {
          const wallet = new Wallet(this.privateKeys[ix], this.wrapper.provider)
          this.wrapper.wallets.push(wallet)
          const address = await wallet.getAddress()
          const signature = await wallet._signTypedData(message.domain, message.types, message.message)
          const response = await axios.post(
            `${this.providerEndpoint}/authenticate/?token=${this.encryptionToken}`,
            `{ "address": "${address}", "signature": "${signature}" }`
          )
          if (response.data !== 'success') {
            console.error(
              `Unable to authenticate address ${address} into endpoint ${this.providerEndpoint}:`
            )
            console.error('Error:', response.data)
          }
          traceKeyValue(`Signer #${ix}`, [
            ['Address', address],
            ['Balance', await wallet.getBalance()],
            ['Nonce  ', await wallet.getTransactionCount()]
          ])
        }
        delete this.privateKeys
      }
    } catch (e) {
      console.error('Cannot get the HTTP server running !!!')
      console.error(e)
      process.exit(-1)
    }

    traceKeyValue('Listener', [
      ['TCP/host', hostname || '0.0.0.0'],
      ['TCP/port', port],
      ['Log level', logger.level.toUpperCase()]
    ])

    this.expressServer.listen(port, hostname || '0.0.0.0')
    return this
  }
}

export { TenWalletMiddlewareServer }
