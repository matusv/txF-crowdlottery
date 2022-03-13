const { Keypair, Networks, Transaction, TransactionBuilder, Operation, Server, Asset } = require('stellar-sdk');

const HORIZON_URL = 'https://horizon-testnet.stellar.org'
const STELLAR_NETWORK = 'TESTNET'

const server = new Server(HORIZON_URL);

const limitPerPage = 3;

const asset = new Asset("CL", "GD5B6IIJDREAK6IMFZMUEFAC2J66WJS3Q4U3E5DKSQ77ZJT6O4436LLH");

(async () => {

    let contributors = []

    let page = await server.trades()
        .forAssetPair(asset, Asset.native())
        .limit(limitPerPage)
        .order('desc')
        .cursor('6223923007983621-0')
        .call()

    while (page.records.length > 0){
        console.log("page length:", page.records.length)

        //console.log(page)

        for (trade of page.records) {
            //console.log({"contributor": trade["counter_account"], "contribution": trade["counter_amount"], "paging_token": trade["paging_token"]})
            contributors.push({"contributor": trade["counter_account"], "contribution": trade["counter_amount"], "paging_token": trade["paging_token"]})
        }

        page = await page.next();
    }

    console.log(contributors)
})();
