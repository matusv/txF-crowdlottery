import { TransactionBuilder, Server, Networks, Operation, Asset, Keypair, AuthRequiredFlag, AuthRevocableFlag } from 'stellar-sdk'
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
    if (pk === masterPK || pk === feePK)
        throw {message: `Invalid ${name}.`}
}

function validateInputs(source, assetCode, issuer, deadline, threshold, finishOnThreshold, distributionType, distributionCoeff, distributionAmount, contributionAmount, minContributionAmount) {
    validatePublicKey(source, "source")
    validatePublicKey(issuer, "issuer")

    console.log(`${deadline}  ${Date.now()}`)
    if(!Number.isInteger(deadline) || deadline < Date.now())
        throw {message: 'Invalid deadline.'}

    if (distributionType != "constant" && distributionType != "proportional")
        throw {message: 'Invalid distributionType.'}

}

async function create(body) {
    const { source, assetCode, issuer, deadline, threshold, finishOnThreshold, distributionType, distributionCoeff, distributionAmount, contributionAmount, minContributionAmount, contributionFlatFee, contributionPerFee, randomSeed } = body

    validateInputs(source, assetCode, issuer, deadline, threshold, finishOnThreshold, distributionType, distributionCoeff, distributionAmount, contributionAmount, minContributionAmount, contributionFlatFee, contributionPerFee)

    const masterAccount = await server.loadAccount(masterPK)
    const config = await getConfig(masterAccount)
    const fee = await getFee()
    const sourceAccount = await server.loadAccount(source)
    const issuerAccount = await server.loadAccount(issuer)

    const seedKeypairRawPK = Keypair.fromPublicKey(randomSeed).rawPublicKey();
    const crowdLotteryKeypair = Keypair.fromRawEd25519Seed(seedKeypairRawPK);
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

    tx.addOperation(Operation.setOptions({
        setFlags: AuthRevocableFlag | AuthRequiredFlag,
        source: crowdLotteryKeypair.publicKey()
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

    const settings = [source, assetCode, issuer, deadline, threshold, finishOnThreshold, distributionType, distributionCoeff, distributionAmount, contributionAmount, minContributionAmount, contributionFlatFee, contributionPerFee]
    const names = ["createdBy", "assetCode", "issuer", "deadline", "threshold", "finishOnThreshold", "distributionType", "distributionCoeff", "distributionAmount", "contributionAmount", "minContributionAmount", "contributionFlatFee", "contributionPerFee"]

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

    console.log(`settings: ${JSON.stringify(settings)}`)
    console.log(`clBalance: ${clBalance}`)

    if (isCrowdLotteryFinished(settings, clBalance))
        console.log('Contributions are not accepted anymore.')
        //throw {message: 'Contributions are not accepted anymore.'}

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

    if (amountAfterFee.isNegative() || _amount.compareTo(BigNumber(settings.minContributionAmount)) == -1) {
        throw {message: 'Contribution is too low.'}
    }

    const fee = await getFee()

    console.log(`flatFee: ${flatFee}`)
    console.log(`perFee: ${perFee}`)
    console.log(`clFlatFee: ${clFlatFee}`)
    console.log(`clPerFee: ${clPerFee}`)
    console.log(`feeAmount: ${clAmountPerFee}`)
    console.log(`clFeeAmount: ${clAmountPerFee}`)
    console.log(`amountAfterFee: ${amountAfterFee}`)

    let tx = new TransactionBuilder(sourceAccount, {
        fee,
        networkPassphrase: Networks[STELLAR_NETWORK]
    })

    tx.addOperation(Operation.beginSponsoringFutureReserves({
        source: settings.createdBy,
        sponsoredId: crowdlotteryPublicKey
    }))

    tx.addOperation(Operation.changeTrust({
        source: source,
        asset: asset
    }))

    tx.addOperation(Operation.setTrustLineFlags({
          asset: asset,
          source: crowdlotteryPublicKey,
          trustor: source,
          flags: {
            authorized: true,
          }
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

    tx.addOperation(Operation.setTrustLineFlags({
          asset: asset,
          source: crowdlotteryPublicKey,
          trustor: source,
          flags: {
            authorized: false,
          }
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

    tx.addOperation(Operation.endSponsoringFutureReserves({
        source: crowdlotteryPublicKey
    }))

    tx = tx.setTimeout(0).build()

    return tx.toXDR('base64')
}

async function distribute(body) {
    const {crowdlotteryPublicKey, txHashRandomSeed} = body

    validateTxHashRandomSeed(txHashRandomSeed)

    const crowdlotteryAccount = await server.loadAccount(crowdlotteryPublicKey)
    const settings = getCrowdLotterySettings(crowdlotteryAccount)
    const asset = new Asset("CL", crowdlotteryPublicKey)

    const issuerAccount = await server.loadAccount(settings.issuer)
    const isIssuerLocked = isLocked(issuerAccount)

    const randomSeed = Buffer.from(txHashRandomSeed, 'hex').slice(-4).readUInt32BE(0);
    const random = new Random(randomSeed);

    let page = await server.trades()
        .forAssetPair(asset, Asset.native())
        .limit(200)
        .order('desc')
        .call()

    let contributors = []
    let sumContributions = 0

    while (page.records.length > 0){
        for (trade of page.records) {
            contributors.push({
                "contributor": trade["counter_account"],
                "contribution": parseFloat(rade["counter_amount"])
            })
            sumContributions += parseFloat(trade["counter_amount"])
        }
        page = await page.next();
    }

    let numReceivers = getNumReceivers(settings)
    let drawnContributorIndices = new Set()
    let drawnContributors = []
    for (let i = 0; i < numReceivers; i++) {

        let contributorIndex = drawContributorIndex(contributors, random)
        while (drawnContributorIndices.has(contributorIndex)) {
            contributorIndex = drawContributorIndex(contributors, random)
        }
        drawnContributorIndices.add(contributors[contributorIndex])
        drawnContributors.push(contributors[contributorIndex]["contributor"])
    }

    let lastDistributedIndex = getLastDistributedIndex(crowdlotteryAccount)

    const fee = await getFee()

    const creatorAccount = await server.loadAccount(settings.createdBy)
    let tx = new TransactionBuilder(creatorAccount, {
        fee,
        networkPassphrase: Networks[STELLAR_NETWORK]
    })

    const numTxDistributions = 1;
    for (let i = 0, i < numTxDistributions; i++){
        lastDistributedIndex += 1;
        tx.addOperation(Operation.payment({
            source: crowdlotteryPublicKey,
            destination: drawnContributors[lastDistributedIndex],
            asset: Asset.native(),
            amount: feeAmount.toFixed(7)
        }))
    }

    tx.addOperation(Operation.manageData({
        source: crowdLotteryKeypair.publicKey(),
        name: "lastDistributedIndex",
        value: lastDistributedIndex
    }))




}

function validateTxHashRandomSeed(txHashRandomSeed) {
    //TODO: check if this txHash is a valid random seed.
    //For each crowdlottery only 1 txHashRandomSeed is created after the contribution phase is done.
    return true
}

function getLastDistributedIndex(crowdlotteryAccount) {
    let lastDistributedIndex = -1
    if ("lastDistributedIndex" in crowdlotteryAccount.data_attr) {
        lastDistributedIndex = parseInt(decodeManageDataString(crowdlotteryAccount.data_attr.lastDistributedIndex))
    }
    return lastDistributedIndex
}

function drawContributorIndex(contributors, random) {
    const rand = random.getRandomFloat(0, sumContributions)
    let sum = 0
    for(let i = 0; i < contributors.lenght; i++) {
        sum += contributors[i]["contribution"]
        if (sum >= rand) {
            return i
        }
    }
}

function getNumReceivers(settings) {
    let numReceivers = 1
    if (settings.distributionCoeff != "undefined") {
        const distributionCoeff = parseFloat(settings.distributionCoeff)
        if (distributionCoeff > 0 && distributionCoeff < 1) {
            numReceivers = distributionCoeff * contributors.length
        } else if (Number.isInteger(distributionCoeff) && distributionCoeff > 1){
            numReceivers = distributionCoeff
        }
    }
    return numReceivers
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
        }))
    }

    tx.addOperation(Operation.setOptions({
        masterWeight: 0,
        lowThreshold: signers.length,
        medThreshold: signers.length,
        highThreshold: signers.length,
        source: publicKey
    }))

    return tx;
}

function decodeManageDataString(str) {
    return new Buffer(str, 'base64').toString("utf-8")
}

function getBalance(account, assetCode, issuer) {
    console.log("getBalance")
    console.log(account)

    for (const balance of account.balances) {
        console.log(`${balance.asset_type} ${balance.asset_code} ${balance.asset_issuer}`)
        if (balance.asset_type.startsWith("credit") &&
            balance.asset_code == assetCode &&
            balance.asset_issuer == issuer){
                return balance.balance
            }
        if (assetCode == "XLM" && balance.asset_type == "native") {
            return balance.balance
        }
    }
    return
}

function getCrowdLotterySettings(crowdlotteryAccount) {
    console.log("getCrowdLotterySettings")

    const settingNames = ["createdBy", "assetCode", "issuer", "contributionAmount", "threshold", "deadline", "contributionFlatFee", "contributionPerFee"]
    let settings = {}

    for (const name of settingNames) {
        if (!(name in crowdlotteryAccount.data_attr))
            throw {message: `${name} is not set.`}

        settings[name] = decodeManageDataString(crowdlotteryAccount.data_attr[name])
    }

    console.log(JSON.stringify(settings))
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

class Random {
    constructor (seed) {
        this.MAX_UINT_32 = Math.pow(2, 32);
        this.sfmt = new SFMT(seed);
    }

    getRandomFloat (min, max) {
        return min + (this.sfmt.GetNext32Bit() / this.MAX_UINT_32) * (max - min)
    }
}

// Copyright (c) 2006,2007 Mutsuo Saito, Makoto Matsumoto and Hiroshima
// University.
// Copyright (c) 2012 Mutsuo Saito, Makoto Matsumoto, Hiroshima University
// and The University of Tokyo.
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
//     * Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above
//       copyright notice, this list of conditions and the following
//       disclaimer in the documentation and/or other materials provided
//       with the distribution.
//     * Neither the names of Hiroshima University, The University of
//       Tokyo nor the names of its contributors may be used to endorse
//       or promote products derived from this software without specific
//       prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

class SFMT {

    constructor(seed) {
        this.MEXP = 19937;
        this.SL1 = 18;
        this.SR1 = 11;
        this.MSK1 = 0xdfffffef;
        this.MSK2 = 0xddfecb7f;
        this.MSK3 = 0xbffaffff;
        this.MSK4 = 0xbffffff6;
        this.PARITY1 = 0x00000001;
        this.PARITY2 = 0x00000000;
        this.PARITY3 = 0x00000000;
        this.PARITY4 = 0x13c9e684;
        this.N = 156;
        this.N32 = 624;
        this.Initialize(seed);
    }

    GetNext64Bit() {
        var lower = this.GetNext32Bit();
        var upper = this.GetNext32Bit();
        return [ upper, lower ];
    }

    GetNext32Bit() {
        //Checks if current array has been used fully and needs reshuffle
        if (this.idx >= this.N32) {
            this.Shuffle();
            this.idx = 0;
        }
        return this.sfmt[this.idx++];
    }

    Initialize(seed) {
        var s;
        this.sfmt = new Uint32Array(this.N32);
        this.sfmt[0] = seed;
        //Initializes the SFMT array
        for (let i = 1; i < this.N32; i++) {
            s = this.sfmt[i - 1] ^ (this.sfmt[i - 1] >>> 30);
            this.sfmt[i] = ((((s >>> 16) * 0x6C078965) << 16) + (s & 0xffff) * 0x6C078965) + i;
        }
        this.Certify();
        this.idx = this.N32;
    }

    Certify() {
        var PARITY = new Uint32Array(4);
        PARITY[0] = this.PARITY1;
        PARITY[1] = this.PARITY2;
        PARITY[2] = this.PARITY3;
        PARITY[3] = this.PARITY4;
        var i, j;
        var work, inner;

        for (i = 0; i < 4; i++)
            inner ^= this.sfmt[i] & PARITY[i];

        for (i = 16; i > 0; i >>= 1)
            inner ^= inner >> i;

        inner &= 1;

        if (inner == 1)
            return;

        for (i = 0; i < 4; i++) {
            work = 1;
            for (j = 0; j < 32; j++) {
                if ((work & PARITY[i]) != 0) {
                    this.sfmt[i] = (this.sfmt[i] ^ work) >>> 0;
                    return;
                }
                work = work << 1;
            }
        }
    }

    Advance(frames) {
        this.idx += frames * 2;
        while (this.idx > 624) {
            this.idx -= 624;
            this.Shuffle();
        }
    }

    Shuffle() {
        var a, b, c, d;

        a = 0;
        b = 488;
        c = 616;
        d = 620;

        //Reshuffles the SFMT array
        do {
            this.sfmt[a + 3] = this.sfmt[a + 3] ^ (this.sfmt[a + 3] << 8) ^ (this.sfmt[a + 2] >>> 24) ^ (this.sfmt[c + 3] >>> 8) ^ (((this.sfmt[b + 3] >>> this.SR1) & this.MSK4) >>> 0) ^ (this.sfmt[d + 3] << this.SL1);
            this.sfmt[a + 2] = this.sfmt[a + 2] ^ (this.sfmt[a + 2] << 8) ^ (this.sfmt[a + 1] >>> 24) ^ (this.sfmt[c + 3] << 24) ^ (this.sfmt[c + 2] >>> 8) ^ (((this.sfmt[b + 2] >>> this.SR1) & this.MSK3) >>> 0) ^ (this.sfmt[d + 2] << this.SL1);
            this.sfmt[a + 1] = this.sfmt[a + 1] ^ (this.sfmt[a + 1] << 8) ^ (this.sfmt[a + 0] >>> 24) ^ (this.sfmt[c + 2] << 24) ^ (this.sfmt[c + 1] >>> 8) ^ (((this.sfmt[b + 1] >>> this.SR1) & this.MSK2) >>> 0) ^ (this.sfmt[d + 1] << this.SL1);
            this.sfmt[a + 0] = this.sfmt[a + 0] ^ (this.sfmt[a + 0] << 8) ^ (this.sfmt[c + 1] << 24) ^ (this.sfmt[c + 0] >>> 8) ^ (((this.sfmt[b + 0] >>> this.SR1) & this.MSK1) >>> 0) ^ (this.sfmt[d + 0] << this.SL1);
            c = d;
            d = a;
            a += 4;
            b += 4;
            if (b >= this.N32)
                b = 0;
        } while (a < this.N32);
    }
}
