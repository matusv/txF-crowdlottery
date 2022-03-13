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

const contributors = [
    Keypair.fromSecret("SABNXEH6WXW2TUIX4FQ2DHGP4LIDESYZLQJKPJT5H57YAUIYJV6ITTLV"), //GAVUM7VDRO6GZM7LIYCC6UYMGVOE3PTYHI6GFD5CV6AD3K3MYHQLD564
    Keypair.fromSecret("SD5WLJX26JDJOUZR2UZTH53OOLXXBLNWCYSLLHGARAITAGWM2H5I4M76"), //GBAPCRPTWEY4DCAMW7CWTU234WL2PE2AEWCP2OKZVURS7WMS5XEW6FFG
    Keypair.fromSecret("SA6ARNHS6PWQLI7U2W7V3PY5TJTAXFVGPR6SLJNEGFNMXPHDPU3N6AY5"), //GDC7JINLPTCB4VUI546LVM3KA67ED2SSVCG24QV4WO3MXDJNLNPHVP2S
    Keypair.fromSecret("SD5H6NYNLSXYKOSDFSPMV4NHT6T6R3QI6RIAUUHWGO7WKQBDRSNK2BT7"), //GB255TYHYYB4OB23A65KKGCFE3Q3VR7457BDN3ULAJW66EZU6G6QKZTE
    Keypair.fromSecret("SDVKVHOMNSIJPSKAOPNX3IME2LEDOAQ5PXW2TUKWC4HEICYSW62FHRUA"), //GCJOVWNBHHBA67OOKQ5KA4KAA57YVGDIOME7EJNZDJRT7T7OD6GIFKUL
    Keypair.fromSecret("SDAYH5PXVKRPMERUZ7KLOFRP3KUXQRGPQQX6NLRSSJDUT6KDLOFT5L6B"), //GD3LKKULFARTPRPTA6FCZSMINSEZ5AUUHFP645VW3RJWDOCU5MT7JFZU
    Keypair.fromSecret("SC3IMCELVOY56ZGBISYBDCDHSQGBJNLS6PK3KSZPZW52EENXF6BWSTUC"), //GB6EKF2RCJH6MU4F5TKWG6UCDAOCHAGZ6BS2PU3556E3N2VU2S5VJ4Q2
    Keypair.fromSecret("SCJDZFNWJE2LWROBCQUT4KDCVQ532U4FL243QY5BJN7MUIM7NMXTXWBJ"), //GAFXMVAC7KJDBPTOCBODFBTYQ53ZLQ4B5SVM3AUOAL5Q6U7235N56AUJ
    Keypair.fromSecret("SDR5S75IC2HWEHR3DPF6U46FJKSJ7ZPB4E2PKXAU6WJAH4W62QOT5BC2"), //GBXUPDYN3TUNT4SR56Y4S7675PXQXXUV7QDMACKLFZNGE4WGVPS3HJK5
    Keypair.fromSecret("SABIHVEZWY7Q5B5SGAW5YGU7DPLIRXOUDTDF3GTJGMBVPHJM7N6RXZGI") //GDNK7IZR3PXCF4VFBDG7LHSIOLMC4MUVZYFREZMXNZOXDQMKZBPXNJDV
]

//Public Key	GDX5WGZJD4QKJGI7R3FYGLWPLUVHFIIDHR26WBRBJFXVJVXZEVEF3PMD
const issuer = Keypair.random();
console.log("issuer public:", issuer.publicKey())
console.log("issuer secret:", issuer.secret())
const asset = new Asset("TestNFT", issuer.publicKey())

async function issueTestNFT() {
    const fee = await getFee();

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
        amount: "0.0000003"
    }))

    tx.addOperation(Operation.manageData({
        source: issuer.publicKey(),
        name: "ipfshash",
        value: ""
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
    //await issueTestNFT()

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
                //let txXdr = await createCrowdLottery(vm, txFunctionCode)
                //let txXdr = await contribute(vm, txFunctionCode, i)
                let txXdr = await distribute(vm, txFunctionCode)
                //console.log("txXdr:", txXdr)
                txHash = await submitXDR(txXdr, i);
            } catch (e) {
                console.log(e);
            }

        } catch(err) {
            console.error(err)
        }
    }
})();

async function createCrowdLottery(vm, txFunctionCode){
    await issueTestNFT()

    return await vm.run(txFunctionCode, 'vm.js')({
        action: 'create',
        source: source.publicKey(),
        assetCode: "TestNFT",
        issuer: issuer.publicKey(),
        deadline: Date.now() + 600000,
        threshold: 1000,
        finishOnThreshold: true,
        distributionType: "constant",
        distributionCoeff: "undefined",
        distributionAmount: "0.0000001",
        contributionAmount: "undefined",
        minContributionAmount: "1",
        contributionFlatFee: "5",
        contributionPerFee: "0.001",
        randomSeed: Keypair.random().publicKey()
    })
};

async function contribute(vm, txFunctionCode, i){
    return await vm.run(txFunctionCode, 'vm.js')({
        action: 'contribute',
        crowdlotteryPublicKey: 'GC4EVEUP33GQHTNVBQJYEIBMTBJ355HUCFM652X6RSBQ2ICDL4DDMLRG',
        source: contributors[i].publicKey(),
        amount: '21.5'
    })
};

async function distribute(vm, txFunctionCode){
    return await vm.run(txFunctionCode, 'vm.js')({
        action: 'distribute',
        crowdlotteryPublicKey: 'GC4EVEUP33GQHTNVBQJYEIBMTBJ355HUCFM652X6RSBQ2ICDL4DDMLRG',
        txHashRandomSeed: "aa9f713387e5c90abb9d2f7c752a4a85caf2a69898a61d28cf8bf082e1d1e101"
    })
};

async function submitXDR(xdr, i) {

    let tx = new Transaction(xdr, Networks.TESTNET);

    tx.sign(signerKeypair);
    //tx.sign(contributors[i]);

    try {
        const txResult = await server.submitTransaction(tx);
        //console.log(JSON.stringify(txResult, null, 2));
        console.log('Success! tx id:', txResult.id);

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
