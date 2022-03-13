# txF-crowdlottery

Locks NFT/token into a “crowdlottery” txfunction. The NFT/token will be distributed to contributors later depending on the parametrization. The parametrization can be used to create a crowdfunding or a lottery or something in between.

To run:
```
rollup -c
node index.js
```

## WIP docs

### 1. Action:create

*Creates a new crowdlottery as a stellar account which holds settings in manageData keypairs.*

**Parameters**: 

*source, assetCode, issuer, deadline, threshold, finishOnThreshold, distributionType, distributionCoeff, distributionAmount, contributionAmount, minContributionAmount, contributionFlatFee, contributionPerFee*

- **source**
- **assetCode**:str, required
- **issuer**:str, required
- **deadline**
- **threshold**
    - threshold for collected funds when crowdlottery becomes “successful”
- **finishOnThreshold**
    - stop accepting contributions and allow distribution process to begin when threshold is reached
- **distributionType:str**, required
    - constant - define **distributionAmount**
    - proportional
- **distributionCoeff:**number, optional
    - needs to be defined if issuer is unlocked
    - float < 1 - ratio of contributers to receive token/NFT
    - integer > 1 - number of participants to receive token/NFT
- **distributionAmount:**number, optional, default=0.0000001
- **contributionAmount:** str, optional
    - if defined participants have to contribute this amount, otherwise they can contribute arbitrary amount.
- **minContributionAmount**
- **contributionFlatFee**
    - this fee is for crowdlottery creators
- **contributionPerFee**
    - this fee is for crowdlottery creators

### 2. Action:contribute

*People can send in contributions while a crowdlottery isn’t finished.*

Parameters:

- **crowdlotteryPublicKey**:str, required
- **source**
- **amount**:number, required

### 3. Action:distribute

*When a crowdlottery is finished, the distribution starts.*

*Iteratively distribute token/NFT according to the parameters of the crowdlottery.*

### 4.Action:updateConfig

*Update global parameters of the txfunctions.*

Parameters:

- **newCreationFee**:number, optional
- **newContributionFlatFee**:number, optional
    - this fee is for developers
- **newContributionPerFee**:number, optional
    - this fee is for developers


