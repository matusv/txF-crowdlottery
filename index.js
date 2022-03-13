const { NodeVM } = require('vm2');
const fs = require('fs');
const { Keypair, Networks, Transaction, TransactionBuilder, Operation, Server, Asset } = require('stellar-sdk');

const HORIZON_URL = 'https://horizon-testnet.stellar.org'
const STELLAR_NETWORK = 'TESTNET'
const server = new Server(HORIZON_URL);

const feeKeypair = Keypair.fromSecret("SD4QA6I6VTH3UR7W4VSJXCIOVUGEGUKGM75JAG4Q3LROICYJU6HCCEJS");
const masterKeypair = Keypair.fromSecret("SBPQ44IHNVFIEC5NFMPZLT4WUUVHNFIQGKONM2R7MQ2OX757GI2JVX2Q");

//GCXXNQ32WKSSFRCNXV2DBO3NOD2P7SZQEUB7YTKDSJR3ZEBBFFCQ74KW
const signerKeypair = Keypair.fromSecret("SCTYAHHCSTB6TWGEUF4P5HMYND2KCU6VV526XZLWTJBRJPGVOWJ452TT");

//Public Key	GDAJR6HGDT6MSMAK644QF5ZS5UNEHXKVUEW4IP7VYNMNBN2PAE7L4JX4
const source = Keypair.fromSecret("SDBN4IZIX2P2JF3FHZHW7ST5XEGI34BY3FY5FE62HB53TBRV3QDVKQMM");

//Public Key	GDX5WGZJD4QKJGI7R3FYGLWPLUVHFIIDHR26WBRBJFXVJVXZEVEF3PMD
const issuer = Keypair.random();
console.log("issuer public:", issuer.publicKey())
console.log("issuer secret:", issuer.secret())
const asset = new Asset("TestNFT", issuer.publicKey())


async function issueTestNFT() {
    const fee = await getFee();

    console.log("fee:", fee);

    const sourceAccount = await server.loadAccount(source.publicKey());

    let tx = new TransactionBuilder(sourceAccount, {
        fee,
        networkPassphrase: Networks[STELLAR_NETWORK]
    });

    tx.addOperation(Operation.createAccount({
        source: source.publicKey(),
        destination: issuer.publicKey(),
        startingBalance: '100'
    }))

    tx.addOperation(Operation.changeTrust({
        source: source.publicKey(),
        asset: asset
    }))

    tx.addOperation(Operation.payment({
        source: issuer.publicKey(),
        destination: source.publicKey(),
        asset: asset,
        amount: "0.0000001"
    }))

    tx.addOperation(Operation.setOptions({
        masterWeight: 0,
        source: issuer.publicKey()
    }));

    tx.addOperation(Operation.setOptions({
        source: issuer.publicKey(),
        signer: {
            ed25519PublicKey: signerKeypair.publicKey(),
            weight: 1
        }
    }));

    tx = tx.setTimeout(100).build();
    tx.sign(source);
    tx.sign(issuer);

    try {
        const txResult = await server.submitTransaction(tx);
        //console.log(JSON.stringify(txResult, null, 2));
        console.log(`TestNFT issued (tx id: ${txResult.id})`);
    } catch (e) {
        console.log('An error has occured:');
        console.log(e.response.data);
        //console.log(e.response.data.extras.result_codes);
    }
}



(async () => {
    await issueTestNFT()

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

            const txFunctionCode = fs.readFileSync('./dist/txF-crowdlottery.js', 'utf8')

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
        source: source.publicKey(),
        assetCode: "TestNFT",
        issuer: issuer.publicKey(),
        deadline: 1647298800,
        threshold: 1000,
        finishOnThreshold: true,
        distributionType: "constant",
        distributionCoeff: "1",
        distributionAmount: "0.0000001",
        contributionAmount: "undefined",
        minContributionAmount: "1",
        contributionFlatFee: "5",
        contributionPerFee: "0.001",
    })
};

async function submitXDR(xdr) {

    let tx = new Transaction(xdr, Networks.TESTNET);

    //tx.sign(masterKeypair);

    //tx.sign(buyerKeypair);
    tx.sign(signerKeypair);

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
