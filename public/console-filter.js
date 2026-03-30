(function(){
if(typeof window==='undefined')return;
if(new URLSearchParams(window.location.search).has('verbose'))return;
var A=['[devnet-boot]','[devnet]','[DevnetContext]','[LimitOrder]','Error','error','FATAL','FAILED','deployed','Phase '];
function ok(a){for(var i=0;i<a.length;i++){var v=a[i];if(v instanceof Error)return true;if(typeof v==='string')for(var j=0;j<A.length;j++)if(v.indexOf(A[j])!==-1)return true;}return false;}
var L=console.log.bind(console),W=console.warn.bind(console),E=console.error.bind(console);
// Override on the prototype so indirect calls (WASM arg0.call(arg1,arg2)) also filter
Object.defineProperty(console,'log',{value:function(){if(ok(arguments))L.apply(null,arguments);},writable:true,configurable:true});
Object.defineProperty(console,'warn',{value:function(){if(ok(arguments))W.apply(null,arguments);},writable:true,configurable:true});
Object.defineProperty(console,'error',{value:function(){if(arguments.length>0&&(arguments[0] instanceof Error||ok(arguments)))E.apply(null,arguments);},writable:true,configurable:true});
Object.defineProperty(console,'debug',{value:function(){},writable:true,configurable:true});
})();
