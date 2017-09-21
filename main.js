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

var sockets = [];

var myGenesisBlock = new Block(0, "0", Date.now(), "my genesis block!!", "816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7"); // genesis block

var blockchain = [myGenesisBlock];

var MessageType = {
  QUERY_LATEST: 0,
  QUERY_ALL: 1,
  RESPONSE_BLOCKCHAIN: 2
};

var responseChainMsg = () => ({
  "type": MessageType.RESPONSE_BLOCKCHAIN,
  "data": JSON.stringify([blockchain])
})

var responseLatestMsg = () => ({
  "type": MessageType.RESPONSE_BLOCKCHAIN,
  "data": JSON.stringify([getLatestBlock()])
});

var write = (ws, message) => {
  ws.send(JSON.stringify(message));
}

var broadcast = (message) => { // broadcast to all nodes
  sockets.forEach(socket => write(socket, message));
}

var queryAllMsg = () => ({
  "type": MessageType.QUERY_ALL
});

var isValidChain = (blockchainToValidate) => {
  if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(blockchain[0])) { // check if the genesis block are correct
    return false;
  }
  var tempBlocks = [blockchainToValidate[0]];
  for (i = 1; i < blockchainToValidate.length; i++) {
    if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
      tempBlocks.push(blockchainToValidate[i]);
    } else {
      return false;
    }
  }
  return true;
}

var replaceChain = (newBlocks) => {
  if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
    console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
    blockchain = newBlocks;
    broadcast(responseLatestMsg());
  } else {
    console.log('Received blockchain invalid!');
  }
}

var handleBlockchainResponse = (message) => {
  var receivedBlocks = JSON.parse(message.data).sort((b1, b2) => (b1 - b2));
  var latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
  var latestBlockHold = getLatestBlock();
  if (latestBlockReceived.index > latestBlockHold.index) {
    console.log('current blockchain possibly behind. We got: ' + latestBlockHold.index + ' Peer got: ' + latestBlockReceived.index);
    if (latestBlockHold.hash === lastestBlockReceived.previousHash) {
      console.log('We can append the received block to our blockchain');
      blockchain.push(latestBlockReceived);
      broadcast(responseLatestMsg());
    } else if (receivedBlocks.length === 1) {
      console.log('We have to query the chain from our peer');
      broadcast(queryAllMsg());
    } else {
      console.log('received blockchain is longer than current blockchain, we need to replace the current by the received');
      replaceChain(receivedBlocks);
    }
  } else {
    console.log('received blockchain is not longer than current blockchain. Do nothing');
  }
}

var initMessageHandler = ws => {
  ws.on('message', (data) => { // when all the frames are received
    var message = JSON.parse(data);
    console.log('message received: ' + JSON.stringify(message));
    switch(message.type) {
      case MessageType.QUERY_LATEST:
        write(ws, responseLatestMsg());
        break;
      case MessageType.QUERY_ALL:
        write(ws, responseChainMsg());
        break;
      case MessageType.RESPONSE_BLOCKCHAIN:
        handleBlockchainResponse(message);
        break;
    }
  });
}

var initErrorHandler = ws => {
  var closeConnection = ws => {
    console.log('connection failed to peer: ' + ws.url);
    sockets.splice(sockets.indexOf(ws), 1);
  }
  ws.on('close', () => closeConnection(ws));
  ws.on('error', () => closeConnection(ws));
}

var queryChainLengthMsg = () => ({
  "type": MessageType.QUERY_LATEST
});

var initConnection = ws => {
  sockets.push(ws);
  initMessageHandler(ws); // management of message between the nodes
  initErrorHandler(ws); // management of errors (close or fail)
  write(ws, queryChainLengthMsg()); 
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

  app.get('/peers', (req, res) => { //list of all nodes
    res.send(sockets.map(s => s._socket.remoteAddress + ':' + s._socket.remotePort));
  });

  app.post('/addPeer', (req, res) => { // add new nodes
    connectToPeers([req.body.peer]);
    res.send();
  });

  app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
}

var initP2PServer = () => {
  var server = new WebSocket.Server({ port: p2p_port });
  server.on('connection', ws => initConnection(ws));
  console.log('listening websocket p2p port on: ' + p2p_port);
}

connectToPeers(initialPeers); // useless for the first call when creating the first node but for the second call with the second nodes need to peers the two nodes
initHttpServer();
initP2PServer();