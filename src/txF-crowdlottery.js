import { TransactionBuilder, Server, Networks, Operation, Asset, Keypair } from 'stellar-sdk'
import BigNumber from 'bignumber.js';

const masterPK = STELLAR_NETWORK === 'PUBLIC'
    ? ''
    : 'GCBPZLYY2PHHF5FOGXZHKLUKCBRQVX5KQWMLA5ROY7IWUE5GDOMUG2OU'

const feePK = STELLAR_NETWORK === 'PUBLIC'
    ? ''
    : 'GAKWRQF4PPB52L6YCFLEPK2WYT2YSHSZVMXX2WG3HEFGSORAZETVGVX6'

const server = new Server(HORIZON_URL);

export default async (body) => {
    const { action } = body;

    console.log(`action: ${action}`);

    switch(action) {

        case 'create':
            return create(body);

        case 'contribute':
            return contribute(body);

        case 'distribute':
            return distribute(body);

        case 'updateConfig':
            return updateConfig(body);

        default:
            throw {message: 'Invalid action.'}
    }
}

function validatePublicKey(pk, name) {
    if (pk === masterPK)
        throw {message: `Invalid ${name}.`}
}

function validateInputs(source, assetCode, issuer, deadline, threshold, finishOnThreshold, distributionType, distributionCoeff, distributionAmount, contributionAmount, minContributionAmount) {
    validatePublicKey(source, "source")
    validatePublicKey(issuer, "issuer")

    console.log(`${deadline}  ${Date.now()}`)
    if(!Number.isInteger(deadline) || deadline > Date.now())
        throw {message: 'Invalid deadline.'}

    if (distributionType != "constant" && distributionType != "proportional")
        throw {message: 'Invalid distributionType.'}

}

async function create(body) {
    const { source, assetCode, issuer, deadline, threshold, finishOnThreshold, distributionType, distributionCoeff, distributionAmount, contributionAmount, minContributionAmount, contributionFlatFee, contributionPerFee } = body

    validateInputs(source, assetCode, issuer, deadline, threshold, finishOnThreshold, distributionType, distributionCoeff, distributionAmount, contributionAmount, minContributionAmount, contributionFlatFee, contributionPerFee)

    const masterAccount = await server.loadAccount(masterPK)
    const config = await getConfig(masterAccount)
    const fee = await getFee()
    const sourceAccount = await server.loadAccount(source)
    const issuerAccount = await server.loadAccount(issuer)
    const crowdLotteryKeypair = Keypair.random()
    const asset = new Asset(assetCode, issuer)
    const balance = await getBalance(sourceAccount, assetCode, issuer)
    const isIssuerLocked = isLocked(issuerAccount)

    console.log(`balance: ${balance}`)
    console.log(`isIssuerLocked: ${isIssuerLocked}`)
    console.log(`config: ${JSON.stringify(config)}`)
    //console.log(`issuerAccount: ${JSON.stringify(issuerAccount)}`)


    let tx = new TransactionBuilder(sourceAccount, {
        fee,
        networkPassphrase: Networks[STELLAR_NETWORK]
    })

    tx.addOperation(Operation.beginSponsoringFutureReserves({
        source: source,
        sponsoredId: crowdLotteryKeypair.publicKey()
    }))

    tx.addOperation(Operation.createAccount({
        source: source,
        destination: crowdLotteryKeypair.publicKey(),
        startingBalance: '0'
    }))


    tx = lock(tx, crowdLotteryKeypair.publicKey(), config.signers)

    //If issuer is not locked, lock it with turrets.
    if (!isIssuerLocked) {

        tx.addOperation(Operation.beginSponsoringFutureReserves({
            source: source,
            sponsoredId: issuer
        }));

        tx = lock(tx, issuer, config.signers)

        tx.addOperation(Operation.endSponsoringFutureReserves({
            source: issuer
        }));

    } else if(typeof balance !== "undefined") {

        tx.addOperation(Operation.changeTrust({
            source: crowdLotteryKeypair.publicKey(),
            asset: asset
        }))

        //Lock token/NFT which will be distributed
        tx.addOperation(Operation.payment({
            source: source,
            destination: crowdLotteryKeypair.publicKey(),
            asset: asset,
            amount: BigNumber(balance).toFixed(7)
        }))

    }

    const settings = [source, issuer, deadline, threshold, finishOnThreshold, distributionType, distributionCoeff, distributionAmount, contributionAmount, minContributionAmount, contributionFlatFee, contributionPerFee]
    const names = ["createdBy", "issuer", "deadline", "threshold", "finishOnThreshold", "distributionType", "distributionCoeff", "distributionAmount", "contributionAmount", "minContributionAmount", "contributionFlatFee", "contributionPerFee"]

    for(let i=0; i < settings.length; i++){
        console.log(`${names[i]} ${settings[i]} ${typeof settings[i]}`)
        tx.addOperation(Operation.manageData({
            source: crowdLotteryKeypair.publicKey(),
            name: names[i],
            value: settings[i].toString()
        }))
    }

    tx.addOperation(Operation.endSponsoringFutureReserves({
        source: crowdLotteryKeypair.publicKey()
    }))

    tx.addOperation(Operation.payment({
        source: source,
        destination: feePK,
        asset: Asset.native(),
        amount: BigNumber(config.creationFee).toFixed(7)
    }))

    tx = tx.setTimeout(0).build()

    tx.sign(crowdLotteryKeypair)

    return tx.toXDR('base64')
}

async function contribute(body) {
    const {crowdlotteryPublicKey, source, amount} = body

    validatePublicKey(source, "source")

    const crowdlotteryAccount = await server.loadAccount(crowdlotteryPublicKey)
    const settings = getCrowdLotterySettings(crowdlotteryAccount)
    const clBalance = getBalance(crowdlotteryAccount, "XLM", "")

    if (isCrowdLotteryFinished(settings, clBalance))
        throw {message: 'Contributions are not accepted anymore.'}

    const clFlatFee = new BigNumber(settings.contributionFlatFee)
    const clPerFee = new BigNumber(settings.contributionPerFee)

    const sourceAccount = await server.loadAccount(source)
    const asset = new Asset("CL", crowdlotteryPublicKey)

    const masterAccount = await server.loadAccount(masterPK)
    const config = await getConfig(masterAccount)
    const _amount = new BigNumber(amount)
    const flatFee = new BigNumber(config.contributionFlatFee)
    const perFee = new BigNumber(config.contributionPerFee)

    const amountPerFee = _amount.multipliedBy(perFee)
    const feeAmount = amountPerFee.plus(flatFee)

    const clAmountPerFee = _amount.multipliedBy(clPerFee)
    const clFeeAmount = clAmountPerFee.plus(clFlatFee)

    const amountAfterFee = _amount.minus(feeAmount).minus(clFeeAmount)

    console.log("1")

    let tx = new TransactionBuilder(sourceAccount, {
        fee,
        networkPassphrase: Networks[STELLAR_NETWORK]
    })

    transaction.addOperation(Operation.changeTrust({
        source: source,
        asset: asset
    }))

    tx.addOperation(Operation.manageSellOffer({
        source: crowdlotteryPublicKey,
        selling: asset,
        buying: Asset.native(),
        price: "1",
        amount: amountAfterFee.toFixed(7)
    }))

    tx.addOperation(Operation.manageSellOffer({
        source: source,
        selling: Asset.native(),
        buying: asset,
        price: "1",
        amount: amountAfterFee.toFixed(7)
    }))

    tx.addOperation(Operation.payment({
        source: source,
        destination: feePK,
        asset: Asset.native(),
        amount: feeAmount.toFixed(7)
    }))

    tx.addOperation(Operation.payment({
        source: source,
        destination: settings.createdBy,
        asset: Asset.native(),
        amount: clFeeAmount.toFixed(7)
    }))

    tx = tx.setTimeout(0).build()

    return tx.toXDR('base64')
}

async function distribute(body) {
    const {crowdlotteryPublicKey, randomSeed} = body

}

async function updateConfig(body) {
    const {newCreationFee, newContributionFee} = body
}

async function releaseFunds(body) {
    const {crowdlotteryPublicKey} = body

}

function isCrowdLotteryFinished(settings, balance) {
    //const settings = getCrowdLotterySettings(crowdlotteryAccount)
    const currentTimestamp = Date.now()
    //const balance = getBalance(crowdlotteryAccount, "XLM", "")

    if (currentTimestamp > parseInt(settings.deadline))
        return true

    if (settings.finishOnThreshold && balance > parseInt(settings.threshold))
        return true

    return false
}

function isCrowdLotterySuccessful(crowdlotteryAccount) {
    const settings = getCrowdLotterySettings(crowdlotteryAccount)
    const balance = getBalance(crowdlotteryAccount, "XLM", "")

    if (balance > parseInt(settings.threshold))
        return true

    return false
}

function isLocked(account) {

    let sum_weight = 0
    for (const signer of account.signers) {
        sum_weight += signer.weight
    }

    if (sum_weight == 0) {
        return true
    }
    return false
}

function lock(tx, publicKey, signers) {

    for (const signerPK of signers) {
        tx.addOperation(Operation.setOptions({
            source: publicKey,
            signer: {
                ed25519PublicKey: signerPK,
                weight: 1
            }
        }));
    }

    tx.addOperation(Operation.setOptions({
        masterWeight: 0,
        lowThreshold: signers.length,
        medThreshold: signers.length,
        highThreshold: signers.length,
        source: publicKey
    }));

    return tx;
}

function decodeManageDataString(str) {
    return new Buffer(str, 'base64').toString("utf-8")
}

// async function encodeResultParameters(params) {
//     //params.condition
//     //params.distributionType
//     //params.distributionCoeff
//     //params.distributionAmount
//
//     // if (distributionType == "constant") {
//     //     if (typeof distributionAmount === "undefined") {
//     //         distributionAmount = "0.0000001"
//     //     }
//     //
//     // } else if(distributionType == "proportional") {
//     //     throw {message: 'proportional distributionType not implemented.'}
//     //
//     // } else {
//     //     throw {message: 'Invalid distributionType.'}
//     // }
// }

async function getBalance(account, assetCode, issuer) {
    console.log("getBalance")
    console.log(account)

    for (const balance of account.balances) {
        console.log(`${balance.asset_type} ${balance.asset_code} ${balance.asset_issuer}`)
        if (balance.asset_type.startsWith("credit") &&
            balance.asset_code == assetCode &&
            balance.asset_issuer == issuer){
                return balance.balance
            }
        if (balance.assetCode == "XLM" && balance.issuer == "" && balance.asset_type == "native") {
            return balance.balance
        }
    }
    return
}

async function getCrowdLotterySettings(crowdlotteryAccount) {
    const settingNames = ["createdBy", "assetCode", "issuer", "contributionAmount", "threshold", "deadline", "contributionFlatFee", "contributionPerFee"]
    let settings = {}

    for (const name of settingNames) {
        if (!(name in account.data_attr))
            throw {message: `${name} is not set.`}

        settings[name] = decodeManageDataString(account.data_attr[name])
    }

    // const settings = {
    //     createdBy: decodeManageDataString(account.data_attr.createdBy),
    //     assetCode: decodeManageDataString(account.data_attr.assetCode),
    //     issuer: decodeManageDataString(account.data_attr.issuer),
    //     contributionAmount: decodeManageDataString(account.data_attr.contributionAmount),
    //     threshold: parseInt(decodeManageDataString(account.data_attr.threshold)),
    //     finishOnThreshold: parseInt(decodeManageDataString(account.data_attr.threshold)),
    //     deadline: parseInt(decodeManageDataString(account.data_attr.deadline)),
    //     contributionFlatFee: decodeManageDataString(account.data_attr.contributionFlatFee),
    //     contributionPerFee: decodeManageDataString(account.data_attr.contributionPerFee)
    // }

    return settings
}

async function getConfig(account) {
    let signers = [];
    for (const signer of account.signers) {
        if (signer.key == masterPK)
            continue

        signers.push(signer.key);
    }

    if (signers.length == 0)
        throw {message: "Signers are not set."}

    if (!("creationFee" in account.data_attr))
        throw {message: "creationFee is not set."}

    if (!("contributionFlatFee" in account.data_attr))
        throw {message: "contributionFee is not set."}

    if (!("contributionPerFee" in account.data_attr))
        throw {message: "contributionFee is not set."}

    const config = {
        creationFee: decodeManageDataString(account.data_attr.creationFee),
        contributionFlatFee: decodeManageDataString(account.data_attr.contributionFlatFee),
        contributionPerFee: decodeManageDataString(account.data_attr.contributionPerFee),
        signers: signers
    }

    return config
}

function getFee() {
    return server
    .feeStats()
    .then((feeStats) => feeStats?.fee_charged?.max || 100000)
    .catch(() => 100000)
};
