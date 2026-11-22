import {pigment} from './pigment.mjs';
import {deflateSync} from 'node:zlib';
import {palette} from './designs.mjs';
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function chunk(name,data){
 const type=Buffer.from(name),res=Buffer.alloc(data.length+12);res.writeUInt32BE(data.length);type.copy(res,4);data.copy(res,8);
 let crc=-1;for(const b of res.subarray(4,-4))crc=crcTable[(crc^b)&255]^(crc>>>8);res.writeUInt32BE((crc^-1)>>>0,res.length-4);return res;
}
function png(w,h,pixels){
 const head=Buffer.alloc(13);head.writeUInt32BE(w);head.writeUInt32BE(h,4);head[8]=8;head[9]=2;
 const rows=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++)pixels.copy(rows,y*(w*3+1)+1,y*w*3,(y+1)*w*3);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
const glyphs=Object.fromEntries('A:0e111f1111 B:1e111e111e C:0f1010100f D:1e1111111e E:1f101e101f F:1f101e1010 G:0f1013110f H:11111f1111 I:1f0404041f J:010101110e K:1112141211 L:101010101f M:111b151111 N:1119151311 O:0e1111110e P:1e111e1010 Q:0e1111150f R:1e111e1211 S:0f100e011e T:1f04040404 U:111111110e V:1111110a04 W:1111151b11 X:110a040a11 Y:110a040404 Z:1f0204081f 0:0e1315110e 1:040c04040e 2:0e1102041f 3:1e010e011e 4:12121f0202 5:1f101e011e 6:0e101e110e 7:1f01020404 8:0e110e110e 9:0e110f010e'.split(' ').map(s=>s.split(':')));
function lettering(buf,w,h,str,y,color){
 str=str.toUpperCase().replaceAll('-',' ');let scale=Math.max(1,Math.min(5,Math.floor((w-10)/(6*str.length))));let x0=Math.floor((w-str.length*6*scale)/2);
 for(const ch of str){const bits=glyphs[ch]||'0000000000';for(let row=0;row<5;row++)for(let col=0;col<5;col++){
 if(!((parseInt(bits.slice(row*2,row*2+2),16)>>(4-col))&1))continue;
 for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){let x=x0+col*scale+dx,yy=y+row*scale+dy;if(x>=0&&x<w&&yy<h)for(let k=0;k<3;k++)buf[(yy*w+x)*3+k]=color[k];}
 }x0+=6*scale;}
}
const cache=new Map();
export function surface(mat,label=''){
 const key=mat+'|'+label;if(cache.has(key))return cache.get(key);
 const w=label?256:64,h=label?128:64,buf=Buffer.alloc(w*h*3),hex=palette[mat].slice(1),rgb=[0,2,4].map(k=>parseInt(hex.slice(k,k+2),16));
 let seed=3181;for(let y=0;y<h;y++)for(let x=0;x<w;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=seed/4294967296;
 let tone=(n-.5)*.10;if(mat==='oak')tone+=.11*Math.sin(x*.81+Math.sin(y*.12))+.06*Math.sin(x*.23+y*.01);
 if(mat==='cloth')tone+=(x%3===0?.075:0)-(y%3===0?.09:0);
 if(['steel','iron','brass'].includes(mat))tone+=.025*Math.sin(y*3.93);
 if(['red','olive','blue'].includes(mat)&&n>.993)tone+=.16;
 const sample=pigment(mat,x/(w-1),y/(h-1));
 for(let k=0;k<3;k++)buf[(y*w+x)*3+k]=Math.max(0,Math.min(255,(sample?sample[k]*.76+rgb[k]*.24:rgb[k])*(1+tone)));
 }
 if(label){const ink=rgb[0]+rgb[1]+rgb[2]>420?[39,46,42]:[230,225,205];lettering(buf,w,h,'STATION 07',18,ink);lettering(buf,w,h,label,62,ink);}
 const result=png(w,h,buf);cache.set(key,result);return result;
}
