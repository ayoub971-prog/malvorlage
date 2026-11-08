import { extractLines } from './core.js';
self.onmessage = ({data}) => {
  try {const pixels=extractLines(new Uint8ClampedArray(data.pixels),data.width,data.height,data.detail);
    self.postMessage({id:data.id,pixels:pixels.buffer},[pixels.buffer]);
  } catch(e) {self.postMessage({id:data.id,error:e.message});}
};
