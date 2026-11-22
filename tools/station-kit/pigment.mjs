import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
const img=readFileSync(new URL('../../public/assets/station-kit/concept.png',import.meta.url));
const width=img.readUInt32BE(16),height=img.readUInt32BE(20),channels=3,rows=[],stride=width*channels;
if(img[24]!==8||img[25]!==2||img[28])throw Error('Expected original RGB reference plate');
for(let off=8;off<img.length;){const n=img.readUInt32BE(off);if(img.toString('ascii',off+4,off+8)==='IDAT')rows.push(img.subarray(off+8,off+8+n));off+=n+12}
const source=inflateSync(Buffer.concat(rows)),pixels=Buffer.alloc(stride*height);
function paeth(a,b,c){const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c}
for(let y=0;y<height;y++){let k=y*(stride+1),mode=source[k++];for(let x=0;x<stride;x++){let i=y*stride+x,a=x>=3?pixels[i-3]:0,b=y?pixels[i-stride]:0,c=y&&x>=3?pixels[i-stride-3]:0;pixels[i]=(source[k+x]+[0,a,b,(a+b)>>1,paeth(a,b,c)][mode])&255}}
const patches={oak:[797,190,78,39],olive:[482,172,91,88],red:[124,1103,90,27],steel:[571,602,18,75],cloth:[125,865,16,92],rubber:[330,980,21,38]};
export function pigment(mat,u,v){
 const rect=patches[mat];if(!rect)return null;
 const mirror=t=>1-Math.abs(2*t-1);const x=rect[0]+Math.floor(mirror(u)*(rect[2]-1)),y=rect[1]+Math.floor(mirror(v)*(rect[3]-1));
 const i=(y*width+x)*3;return pixels.subarray(i,i+3);
}

