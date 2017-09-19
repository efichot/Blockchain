var WebSocket = require("ws");
var express = require("express");
var bodyParser = require("body-parser");

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

var initHttpServer = () => {
  var app = express();
  app.use(bodyParser.json());

  app.get('/blocks', (req, res) => res.send(JSON.stringify(blockchain))); //route for print the block corresponding to http port
  app.post('/mineBlock', (req, res) => { // mine block with data in it

  });

  app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
}

connectToPeers(initialPeers); // useless for the first call when creating the first node but for the second call with the second nodes need to peers the two nodes
initHttpServer();