/* Geometry-based PARSYS sections. Also exported for extraction regression tests. */
(function(root) {
  'use strict';
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").toLowerCase().trim();
  const titles = new Set([
    'Lieu d’intervention','Événement','Requérant','Déclenchement SMUR','Patient',
    'Antécédents','Traitements en cours','Anamnèse','Mode de vie','Mensurations',
    'Examen clinique','Diagnostic','Diagnostique','Transport','Admission',
    'Examens complémentaires','Évolution médicale','Ventilation',"Voies d'abord",'Signature du médecin'
  ].map(normalize));
  const furniture = /^(compte-rendu de prise en charge smur|intervention du |patient\s*:|smur connect|page\s+\d|\d+\s*\/\s*\d+)/i;
  const containers = new Set(['Volet administratif','Volet médical','Régulation médicale','Diagnostic final','Diagnostique final','Examens complémentaires et Évolution médicale'].map(normalize));
  function extract(pages) {
    const sections = [];
    for (const page of pages) {
      const lines = page.lines.filter(l => !furniture.test(l.text) && !containers.has(normalize(l.text)));
      const items = lines.flatMap(l => (l.items || []).map(item => ({...item, y:item.y ?? l.y})));
      // The surveillance sheet is a grid, not a succession of textual sections.
      const surveillance = lines.some(l => normalize(l.text).includes("surveillance du patient pendant l'intervention"));
      if (surveillance) {
        sections.push({title:'Surveillance · tableau brut',page:page.number,
          lines:(page.ocrText || 'Tableau graphique : voir les paramètres et traitements extraits dans les champs de synthèse, puis vérifier le PDF original.').split('\n'),uncertain:true});
        continue;
      }
      const markers = surveillance ? [] : items.filter(i => titles.has(normalize(i.str)) && i.x < 80)
        .sort((a,b) => b.y-a.y);
      // OCR pages have no coordinates: use explicit headings, retain uncertain text.
      if (!items.length) {
        let block = null;
        for (const line of lines) {
          if (!block || titles.has(normalize(line.text))) {
            block = {title:titles.has(normalize(line.text)) ? line.text : 'Texte à vérifier', page:page.number, lines:[], uncertain:true};
            sections.push(block);
            if (!titles.has(normalize(line.text))) block.lines.push(line.text);
          } else block.lines.push(line.text);
        }
        continue;
      }
      const bounds = [{str:surveillance?'Surveillance · tableau brut':'Informations générales',y:Infinity},...markers];
      for (let index=0;index<bounds.length;index++) {
        const marker=bounds[index], bottom=bounds[index+1]?.y ?? -Infinity;
        if(normalize(marker.str)==='signature du medecin') continue;
        const content=[];
        for (const line of lines) {
          if (!(line.y < marker.y-2 && line.y > bottom+2)) continue;
          // Separate paired form columns before joining labels with their values.
          // Never split an individual PDF text item that spans the page.
          const columns = [[],[]];
          for (const item of line.items || []) columns[item.x >= 290 ? 1 : 0].push(item);
          const texts=columns.map(column => column.sort((a,b)=>a.x-b.x).map((item,i,all)=>{
            const gap=i ? item.x-(all[i-1].x+all[i-1].w) : 0;
            return (i ? gap>10 ? ' : ' : ' ' : '') + item.str;
          }).join('').trim()).filter(Boolean);
          if (texts.length) content.push(texts.join('  |  '));
        }
        // Empty parent headings must not create meaningless NR fields.
        if (content.length) sections.push({title:marker.str,page:page.number,lines:content,uncertain:surveillance});
      }
    }
    return sections;
  }
  root.extractDocumentSections=extract;
  if(typeof module!=='undefined') module.exports={extractDocumentSections:extract};
})(typeof window!=='undefined'?window:globalThis);
