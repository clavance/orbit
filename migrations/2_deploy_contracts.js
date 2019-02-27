var OrbitToken = artifacts.require("./OrbitToken.sol");
var DexToken = artifacts.require("./DexToken.sol");

module.exports = function(deployer) {
  deployer.deploy(OrbitToken, 1000000);
  deployer.deploy(DexToken, 1000000);
};
