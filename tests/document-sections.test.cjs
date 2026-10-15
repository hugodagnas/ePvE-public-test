const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extractDocumentSections:extract}=require('../static/document-sections.js');
function line(y,...items) {
  return {y,text:items.map(i=>i.str).join(' '),items:items.map(i=>({w:70,...i,y}))};
}
test('paired columns stay in the correct section; inline Notes is not a new section',()=>{
  const sections=extract([{number:4,lines:[
    line(700,{x:29,str:'Compte-rendu de prise en charge SMUR'}),
    line(640,{x:29,str:'Évolution médicale'}),
    line(610,{x:35,str:'Heure'},{x:120,str:'12:00'},{x:298,str:'Notes'},{x:380,str:'Observation A'}),
    line(546,{x:29,str:'Ventilation'}),
    line(499,{x:35,str:'Intubation difficile'},{x:160,str:'Non'},{x:298,str:'Mode ventilatoire VI'},{x:420,str:'VAC'}),
    line(401,{x:29,str:"Voies d'abord"}),
    line(353,{x:35,str:'Localisation'},{x:160,str:'Bras droit'}),
    line(303,{x:23,str:'Signature du médecin'}),
    line(280,{x:23,str:'Signé'}),
    line(20,{x:29,str:'Page 4/4'})
  ]}]);
  assert.deepEqual(sections.map(s=>s.title),['Évolution médicale','Ventilation',"Voies d'abord"]);
  assert.match(sections[0].lines.join('\n'),/Notes.*Observation A/);
  assert.doesNotMatch(sections[1].lines.join('\n'),/Notes|Observation A|Bras droit/);
  assert.doesNotMatch(sections[2].lines.join('\n'),/Signé|Signature|Page 4/);
});
test('empty parent headings are omitted and OCR unclassified text is preserved',()=>{
  const sections=extract([{number:2,lines:[line(660,{x:29,str:'Anamnèse'}),line(638,{x:29,str:'Antécédents'}),line(625,{x:29,str:'Texte exemple'})]},
    {number:5,lines:[{text:'Texte OCR sans titre',items:[]},{text:'Suite',items:[]}]}]);
  assert.deepEqual(sections.map(s=>s.title),['Antécédents','Texte à vérifier']);
  assert.deepEqual(sections[1].lines,['Texte OCR sans titre','Suite']);
});
test('surveillance uses the OCR text of the graphic table, not only its native title',()=>{
  const [section]=extract([{number:3,lines:[line(558,{x:303,str:"Surveillance du patient pendant l'intervention"})],ocrText:'Heure 12:00\nFC 80'}]);
  assert.equal(section.uncertain,true);
  assert.deepEqual(section.lines,['Heure 12:00','FC 80']);
});
