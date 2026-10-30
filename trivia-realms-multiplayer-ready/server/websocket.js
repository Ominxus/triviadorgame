'use strict';
// Minimal RFC 6455 server implementation for browser WebSocket clients.
// Using Node's built-ins keeps the project deployable without npm dependencies.
const crypto=require('node:crypto');
const MAX_MESSAGE=8192;
function makeFrame(opcode,data=Buffer.alloc(0)){
  if(!Buffer.isBuffer(data))data=Buffer.from(data);
  const len=data.length,head=Buffer.alloc(len<126?2:len<65536?4:10);
  head[0]=0x80|opcode;
  if(len<126)head[1]=len;
  else if(len<65536){head[1]=126;head.writeUInt16BE(len,2);}
  else{head[1]=127;head.writeBigUInt64BE(BigInt(len),2);}
  return Buffer.concat([head,data]);
}
function upgrade(req,socket,head,onMessage,onClose){
  const key=req.headers['sec-websocket-key'];
  if(req.headers.upgrade?.toLowerCase()!=='websocket'||req.headers['sec-websocket-version']!=='13'||typeof key!=='string'||!(/^[A-Za-z0-9+/]{22}==$/.test(key))){socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');socket.destroy();return null;}
  const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  socket.setNoDelay(true);
  const ws={socket,closed:false,buffer:Buffer.alloc(0),lastPong:Date.now(),roomCode:null,seat:null,
    send(obj){if(this.closed||!socket.writable)return;try{socket.write(makeFrame(1,JSON.stringify(obj)));}catch(e){this.close();}},
    ping(){if(!this.closed&&socket.writable)socket.write(makeFrame(9));},
    close(){if(this.closed)return;this.closed=true;try{socket.end(makeFrame(8));}catch(e){socket.destroy();}},
  };
  function process(chunk){
    ws.buffer=Buffer.concat([ws.buffer,chunk]);
    while(ws.buffer.length>=2){
      const b=ws.buffer,fin=!!(b[0]&0x80),opcode=b[0]&0x0f,masked=!!(b[1]&0x80);
      let size=b[1]&0x7f,offset=2;
      if(size===126){if(b.length<4)return;size=b.readUInt16BE(2);offset=4;}
      else if(size===127){if(b.length<10)return;let big=b.readBigUInt64BE(2);if(big>BigInt(MAX_MESSAGE)){ws.close();return;}size=Number(big);offset=10;}
      if(!masked||size>MAX_MESSAGE||(!fin&&opcode===1)){ws.close();return;}
      if(b.length<offset+4+size)return;
      const mask=b.subarray(offset,offset+4);offset+=4;
      const data=Buffer.from(b.subarray(offset,offset+size));
      ws.buffer=b.subarray(offset+size);
      for(let i=0;i<size;i++)data[i]^=mask[i%4];
      if(opcode===8){ws.close();return;}
      if(opcode===9){socket.write(makeFrame(10,data));continue;}
      if(opcode===10){ws.lastPong=Date.now();continue;}
      if(opcode!==1){ws.close();return;}
      try{const payload=JSON.parse(data.toString('utf8'));onMessage(ws,payload);}catch(e){ws.send({type:'error',message:'Invalid message.'});}
    }
  }
  socket.on('data',process);
  socket.on('error',()=>{});
  socket.on('close',()=>{ws.closed=true;onClose(ws);});
  if(head?.length)process(head);
  return ws;
}
module.exports={upgrade};
