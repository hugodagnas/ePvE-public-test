const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extractDocumentSections:extract}=require('../static/document-sections.js');
const {extractOptionalFields:optional}=require('../static/document-sections.js');
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
test('optional fields exclude the mandatory identity/address/vector and split paired values',()=>{
  const fields=optional([{number:1,lines:[
    line(650,{x:29,str:'Patient'}),
    line(630,{x:29,str:'Date de naissance'},{x:170,str:'01-01-2000'},{x:298,str:'Nationalité'},{x:410,str:'Française'}),
    line(600,{x:29,str:'Déclenchement SMUR'}),
    line(580,{x:29,str:"Type d'intervention"},{x:170,str:'Primaire'},{x:298,str:'Type de vecteur SMUR'},{x:450,str:'UMH'}),
    line(540,{x:29,str:'Mensurations'}),
    line(520,{x:29,str:'Poids'},{x:170,str:'70 kg'},{x:298,str:'Taille'},{x:410,str:'175 cm'})
  ]}]);
  assert.deepEqual(fields.map(f=>f.title),['Nationalité',"Type d'intervention",'Poids','Taille']);
  assert.deepEqual(fields.find(f=>f.title==='Poids').lines,['70 kg (IMC = NR)']);
  assert.deepEqual(fields.find(f=>f.title==='Taille').lines,['175 cm']);
  assert.equal(fields[0].group,'Identité');
});
test('requested compound fields are merged within their page and section only',()=>{
  const {mergeOptionalFields:merge}=require('../static/document-sections.js');
  const field=(title,value,section='Requérant',page=1)=>({title,lines:[value],section,page});
  const result=merge([
    field('Nom du requérant','Dupont'),field('Prénom du requérant','Marie'),field('Type de requérant','Famille'),
    field('Numéro composé en premier','15'),field('Heure du 1er appel','12:30'),
    field('Poids','72 kg','Mensurations',2),field('IMC','22.72','Mensurations',2),
    field('Taille','178 cm','Mensurations',2),field('Poids','80 kg','Mensurations',3)
  ]);
  assert.deepEqual(result.find(f=>f.title==='Requérant').lines,['DUPONT Marie (Famille)']);
  assert.deepEqual(result.find(f=>f.title.startsWith('Numéro')).lines,['15 (1er appel : 12:30)']);
  assert.deepEqual(result.find(f=>f.title==='Poids'&&f.page===2).lines,['72 kg (IMC = 22.72)']);
  assert.deepEqual(result.find(f=>f.title==='Poids'&&f.page===3).lines,['80 kg (IMC = NR)']);
  assert(!result.some(f=>['IMC','Nom du requérant','Prénom du requérant','Type de requérant','Heure du 1er appel'].includes(f.title)));
});
test('normalization removes metadata and empty duplicates, but keeps negative medical answers',()=>{
  const {cleanOptionalFields:clean}=require('../static/document-sections.js');
  const field=(title,value)=>({title,lines:[value],group:'Médical'});
  const fields=clean([
    field('Autres précisions — Ventilation','par Équipe 3'),
    field('Notes','Non renseigné'),field('Notes','NR'),field('Notes',''),
    field('Intubation difficile','Non'),field('Intubation difficile','Non'),
    field('Pression du balonnet','22 mmHg'),field('Signe de detresse respiratoire aigue','Oui')
  ]);
  assert.deepEqual(fields.map(f=>f.title),['Intubation difficile','Pression du ballonnet','Détresse respiratoire aiguë']);
  assert.deepEqual(fields[0].lines,['Non']);
});
