const { NodeVM } = require('vm2');
const fs = require('fs');
const { Keypair, Networks, Transaction, TransactionBuilder, Operation, Server } = require('stellar-sdk');

const HORIZON_URL = 'https://horizon-testnet.stellar.org'
const STELLAR_NETWORK = 'TESTNET'
const server = new Server(HORIZON_URL);

const feeKeypair = Keypair.fromSecret("SD4QA6I6VTH3UR7W4VSJXCIOVUGEGUKGM75JAG4Q3LROICYJU6HCCEJS");
const masterKeypair = Keypair.fromSecret("SBPQ44IHNVFIEC5NFMPZLT4WUUVHNFIQGKONM2R7MQ2OX757GI2JVX2Q");

const signerKeypair = Keypair.fromSecret("");
const source = Keypair.fromSecret("");

(async () => {
    for (let i = 0; i < 1; i++) {

        try {
            const vm = new NodeVM({
                console: 'redirect',
                eval: false,
                wasm: false,
                strict: true,
                sandbox: {
                    HORIZON_URL,
                    STELLAR_NETWORK,
                },
                require: {
                    builtin: ['util', 'stream'],
                    external: {
                        modules: ['bignumber.js', 'node-fetch', 'stellar-sdk', 'lodash']
                    },
                    context: 'host',
                }
            });

            vm.on('console.log', (data) => {
                console.log(`<txF> ${data}`);
            });

            //const seed = Keypair.random().publicKey();

            const txFunctionCode = fs.readFileSync('./dist/txF-SWEX.js', 'utf8')

            let ticketTxHash = null;
            try {
                let txXdr = await createCrowdLottery(vm, txFunctionCode)
                txHash = await submitXDR(txXdr);
            } catch (e) {
                console.log(e);
            }

        } catch(err) {
            console.error(err)
        }
    }
})();

async function createCrowdLottery(vm, txFunctionCode){
    return await vm.run(txFunctionCode, 'vm.js')({
        action: 'create',
        source: ,
        assetCode: ,
        issuer: ,
        deadline: ,
        threshold: ,
        finishOnThreshold: ,
        distributionType: ,
        distributionCoeff: ,
        distributionAmount: ,
        contributionAmount: ,
        minContributionAmount: ,
        contributionFlatFee: ,
        contributionPerFee: ,
    })
};

async function submitXDR(xdr) {

    let tx = new Transaction(xdr, Networks.TESTNET);

    tx.sign(masterKeypair);
    tx.sign(sellerKeypair);
    tx.sign(keypairToSell);
    //tx.sign(buyerKeypair);
    //tx.sign(signerKeypair);

    try {
        const txResult = await server.submitTransaction(tx);
        //console.log(JSON.stringify(txResult, null, 2));
        console.log('Success!');
        console.log('tx id:', txResult.id);

        return txResult.hash;
    } catch (e) {
        console.log('An error has occured:');
        console.log(e.response.data);
        console.log(e.response.data.extras.result_codes);
    }
}

function getFee() {
    return server
    .feeStats()
    .then((feeStats) => feeStats?.fee_charged?.max || 100000)
    .catch(() => 100000)
};
