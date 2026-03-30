(function(){
if(typeof window==='undefined')return;
if(new URLSearchParams(window.location.search).has('verbose'))return;
var A=['[devnet-boot]','[devnet]','[DevnetContext]','[LimitOrder]','Error','error','FATAL','FAILED','deployed','Phase '];
function ok(a){for(var i=0;i<a.length;i++){var v=a[i];if(v instanceof Error)return true;if(typeof v==='string')for(var j=0;j<A.length;j++)if(v.indexOf(A[j])!==-1)return true;}return false;}
var L=console.log,W=console.warn,E=console.error;
console.log=function(){if(ok(arguments))L.apply(console,arguments);};
console.warn=function(){if(ok(arguments))W.apply(console,arguments);};
console.error=function(){if(arguments.length>0&&(arguments[0] instanceof Error||ok(arguments)))E.apply(console,arguments);};
console.debug=function(){};
})();
