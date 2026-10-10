import { contrast, deltaE2000, over, simulate, CVD_TYPES } from "./colorlib.mjs";
const D = { bg:"#0D0A0E", surface:"#18141A", raised:"#221D25", border:"#302A33", borderStrong:"#756D7A", text:"#F7F2F5", muted:"#ADA5AE", accent:"#FF4FB2", accentPressed:"#E63F9E", onAccent:"#0D0A0E", success:"#52E9B2", warning:"#FFCD54", danger:"#FF5A47", info:"#8DB9FF",
  health:"#4DECE4", education:"#5FA7FD", housing:"#F8A650", emergency:"#F36069", retirement:"#B688FE", custom:"#C2F26C" };
const L = { bg:"#F8F5F7", surface:"#FFFFFF", raised:"#FFFFFF", border:"#E9E3E7", borderStrong:"#8A828E", text:"#151217", muted:"#5E5761", accentText:"#8E567C", primary:"#151217", onPrimary:"#FFFFFF", accentFill:"#FF4FB2", onAccentFill:"#0D0A0E", success:"#047A5C", warningText:"#895706", warningFill:"#F5AF20", onWarning:"#1A1300", danger:"#C9241B", info:"#2F6FD0",
  health:"#077F7A", education:"#3A81D7", housing:"#C06F0A", emergency:"#C52D23", retirement:"#7A36D0", custom:"#456B07" };
const rows=[]; const chk=(name,a,b,need)=>{const c=contrast(a,b); rows.push([name,c.toFixed(2),need,c>=need?"ok":"FAIL"]);};
for (const s of ["bg","surface","raised"]) { chk(`D text/${s}`,D.text,D[s],4.5); chk(`D muted/${s}`,D.muted,D[s],4.5); chk(`D accent text/${s}`,D.accent,D[s],4.5); chk(`D borderStrong/${s}`,D.borderStrong,D[s],3); }
chk("D onAccent/accent",D.onAccent,D.accent,4.5); chk("D onAccent/accentPressed",D.onAccent,D.accentPressed,4.5);
for (const k of ["success","warning","danger","info"]) { chk(`D ${k}/surface`,D[k],D.surface,4.5); chk(`D ink on ${k} fill`,D.bg,D[k],4.5); chk(`D ${k}/soft`,D[k],over(D[k],0.14,D.surface),4.5); }
for (const k of ["health","education","housing","emergency","retirement","custom"]) { chk(`D ${k}/surface`,D[k],D.surface,3); chk(`D ink on ${k} fill`,D.bg,D[k],4.5); }
for (const s of ["bg","surface"]) { chk(`L text/${s}`,L.text,L[s],4.5); chk(`L muted/${s}`,L.muted,L[s],4.5); chk(`L accentText/${s}`,L.accentText,L[s],4.5); chk(`L borderStrong/${s}`,L.borderStrong,L[s],3); }
chk("L onPrimary/primary",L.onPrimary,L.primary,4.5); chk("L ink on accentFill",L.onAccentFill,L.accentFill,4.5);
for (const k of ["success","danger","info"]) { chk(`L ${k}/surface`,L[k],L.surface,4.5); chk(`L white on ${k}`,"#FFFFFF",L[k],4.5); }
chk("L warningText/surface",L.warningText,L.surface,4.5); chk("L onWarning/warningFill",L.onWarning,L.warningFill,4.5);
for (const k of ["health","education","housing","emergency","retirement","custom"]) chk(`L ${k}/surface`,L[k],L.surface,3);
for (const k of ["health","education","housing","emergency","retirement","custom"]) chk(`L ink on vivid ${k} fill`,L.text,D[k],4.5);
for (const r of rows) console.log(r.join("  "));
console.log("fails:", rows.filter(r=>r[3]==="FAIL").length, "of", rows.length);
const pairs=[["accent","danger"],["accent","emergency"],["accent","retirement"],["accent","housing"],["success","danger"],["warning","danger"]];
for (const [a,b] of pairs) { const n=deltaE2000(D[a],D[b]); const cvd=CVD_TYPES.map(t=>{try{return deltaE2000(simulate(D[a],t),simulate(D[b],t)).toFixed(1)}catch{return "?"}}); console.log(`ΔE ${a}~${b}: ${n.toFixed(1)} cvd ${cvd.join("/")}`); }
