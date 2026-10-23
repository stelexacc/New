class StelexVoiceRecorder extends AudioWorkletProcessor{
 constructor(){super();this.buffer=new Float32Array(4096);this.at=0;this.stopped=false;this.port.onmessage=event=>{if(event.data?.stop){if(this.at)this.port.postMessage(this.buffer.slice(0,this.at));this.stopped=true;this.port.postMessage({done:true});}};}
 process(inputs){if(this.stopped)return false;const mono=inputs[0]?.[0];if(!mono)return true;for(const sample of mono){this.buffer[this.at++]=sample;if(this.at===this.buffer.length){this.port.postMessage(this.buffer,[this.buffer.buffer]);this.buffer=new Float32Array(4096);this.at=0;}}return true;}
}
registerProcessor('stelex-voice-recorder',StelexVoiceRecorder);
