var WebSocket = require("ws");
var express = require("express");
var bodyParser = require("body-parser");
var CryptoJS = require('crypto-js');

var http_port = process.env.HTTP_PORT || 3001;
var p2p_port = process.env.P2P_PORT || 6001;
var initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];

class Block {
  constructor(index, previousHash, timestamp, data, hash) {
    this.index = index;
    this.previousHash = previousHash;
    this.timestamp = timestamp;
    this.data = data;
    this.hash = hash;
  }
}

var myGenesisBlock = new Block(0, "0", Date.now(), "my genesis block!!", "816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7"); // genesis block

var blockchain = [myGenesisBlock];

var initConnection = ws => {
  
}

var connectToPeers = (newPeers) => {
  newPeers.forEach((peer) => {
    var ws = new WebSocket(peer);
    ws.on('open', () => initConnection(ws));
    ws.on('error', () => {
      console.log('connection failed');
    });
  });
}

var getLatestBlock = () => blockchain[blockchain.length - 1];

var calculateHash = (index, previousHash, timestamp, data) => CryptoJS.SHA256(index + previousHash + timestamp + data).toString(); // hash block

var generateNextBlock = (data) => {
  var previousBlock = getLatestBlock();
  var nextIndex = previousBlock.index + 1;
  var nextTimestamp = Date.now();
  var nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, data);
  return new Block(nextIndex, previousBlock.hash, nextTimestamp, data, nextHash);
}

var calculateHashForBlock = (block) => calculateHash(block.index, block.previousHash, block.timestamp, block.data);

var isValidNewBlock = (newBlock, previousBlock) => {
  if (previousBlock.index + 1 !== newBlock.index) {
    console.log('invalid index');
    return false;
  } else if (previousBlock.hash !== newBlock.previousHash) {
    console.log('invalid previous hash');
    return false;
  } else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
    console.log(typeof calculateHashForBlock(newBlock));
    console.log(typeof newBlock.hash);
    console.log('invalid hash block');
    return false;
  }
  return true;
}

var addBlock = (newBlock) => {
  if (isValidNewBlock(newBlock, getLatestBlock())) {
    blockchain.push(newBlock);
    console.log('block added: ' + JSON.stringify(newBlock));
  }
}

var initHttpServer = () => {
  var app = express();
  app.use(bodyParser.json());

  app.get('/blocks', (req, res) => res.send(JSON.stringify(blockchain))); //route for print the block corresponding to http port
  app.post('/mineBlock', (req, res) => { // data for the new block in the POST req 
    var newBlock = generateNextBlock(req.body.data); //create block
    addBlock(newBlock); // check if the block is valid and add block in the blockchain
    
    res.send();
  });

  app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
}

connectToPeers(initialPeers); // useless for the first call when creating the first node but for the second call with the second nodes need to peers the two nodes
initHttpServer();