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
  const cellLabels = [
    "Type de lieu d'intervention",'Adresse','Médecin régulateur','Motif de recours',
    "Nom d'usage",'Prénom','Type de requérant','Heure du 1er appel',
    'Numéro composé en premier',"Contact de l'appelant","Type d'intervention",'Type de vecteur SMUR','Heure du déclenchement',
    'Consentement','Prénom, Nom','Date de naissance','Âge','Sexe','Nationalité',
    'Date et heure du 1er symptôme',"Heure d'arrivée des premiers secours", "Prise en charge réalisée avant l'arrivée du SMUR",
    'Poids','Taille','IMC','Dyspnée','Signe de detresse respiratoire aigue','Tirage','Balancement thoraco-abdominal',
    'Cyanose','Hypercapnie','Mouvements thoracique','Localisation','Murmure vésiculaire','Bruits surajoutés','Type de bruit',
    'Départ des lieux','Transporté',"Vecteur d'évacuation médicalisé",'Arrivée à destination','Établissement receveur','Arrivée au lit du patient','Médecin receveur',
    'Heure','Notes','Intubation difficile','Mode ventilatoire VI','Taille de la sonde','Interface utilisée','Type de ventilation',
    'PEEP','Pression du balonnet','Rapport I/E',"Repère à l'arcade dentaire",'VT (Volume courant)',"Types de voies d'abord",'Localisation VVP1'
  ];
  const labels=new Set(cellLabels.map(normalize));
  function splitCells(items, top, bottom, sectionTitle) {
    const region=items.filter(i=>i.y < top-2 && i.y > bottom+2);
    const result=[];
    const used=new Set();
    for(const column of [0,1]) {
      const columnItems=region.filter(i=>(i.x>=290?1:0)===column);
      const markers=columnItems.filter(i=>labels.has(normalize(i.str))).sort((a,b)=>b.y-a.y || a.x-b.x);
      for(let n=0;n<markers.length;n++) {
        const marker=markers[n], end=markers[n+1]?.y ?? bottom;
        const values=columnItems.filter(i=>i!==marker && i.y<=marker.y+2 && i.y>end+2 &&
          (normalize(marker.str)!=='heure' || Math.abs(i.y-marker.y)<=2) && (Math.abs(i.y-marker.y)>2 || i.x>marker.x))
          .sort((a,b)=>Math.abs(b.y-a.y)>2?b.y-a.y:a.x-b.x);
        const value=values.map(i=>i.str).join(' ').trim();
        used.add(marker); for(const item of values) used.add(item);
        let title=marker.str;
        if(normalize(title)==='localisation') {
          const related=region.find(i=>i.x<290 && Math.abs(i.y-marker.y)<=2 && labels.has(normalize(i.str)));
          if(related) title+=' — '+related.str;
        }
        if(normalize(title)==='heure') title+=' — '+sectionTitle;
        if(value) result.push({title,lines:[value],section:sectionTitle,y:marker.y,column});
      }
    }
    if(result.length) {
      const remainder=region.filter(i=>!used.has(i)).sort((a,b)=>b.y-a.y || a.x-b.x).map(i=>i.str).join(' ').trim();
      if(remainder) result.push({title:'Autres précisions — '+sectionTitle,lines:[remainder],section:sectionTitle,y:bottom,column:0});
    }
    return result.sort((a,b)=>b.y-a.y || a.column-b.column);
  }
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
        if (content.length) sections.push({title:marker.str,page:page.number,lines:content,
          cells:splitCells(items,marker.y,bottom,marker.str),uncertain:surveillance});
      }
    }
    return sections;
  }
  root.extractDocumentSections=extract;
  function mergeOptionalFields(fields) {
    const result=[...fields];
    const definitions=[
      {title:'Requérant',names:['Nom du requérant','Prénom du requérant','Type de requérant'],
        format:([name,first,type])=>name.toUpperCase()+' '+first+' ('+type+')'},
      {title:'Numéro composé en premier / Heure du 1er appel',names:['Numéro composé en premier','Heure du 1er appel'],
        format:([number,time])=>number+' (1er appel : '+time+')'},
      {title:'Poids',names:['Poids','IMC'],format:([weight,imc])=>weight+' (IMC = '+imc+')'}
    ];
    for(const definition of definitions) {
      const scopes=new Set(result.filter(f=>definition.names.includes(f.title)).map(f=>JSON.stringify([f.page,f.section])));
      for(const scope of scopes) {
        const [page,section]=JSON.parse(scope);
        const parts=definition.names.map(title=>result.find(f=>f.page===page && f.section===section && f.title===title));
        const first=parts.find(Boolean); const index=result.indexOf(first);
        const merged={...first,title:definition.title,lines:[definition.format(parts.map(f=>f ? f.lines.join(' ').trim() || 'NR' : 'NR'))]};
        for(const part of parts) if(part) result.splice(result.indexOf(part),1);
        result.splice(Math.min(index,result.length),0,merged);
      }
    }
    return result;
  }
  function optionalFields(pages) {
    const duplicateSections=new Set(['antecedents','traitements en cours','diagnostic','diagnostique']);
    const duplicateLabels=new Set(['adresse','type de vecteur smur',"prenom, nom",'date de naissance','age','sexe','transporte','etablissement receveur']);
    const groupFor=title=> /patient/.test(normalize(title))?'Identité':
      /lieu|evenement|requerant|declenchement/.test(normalize(title))?'Intervention':
      /transport|admission/.test(normalize(title))?'Transport et orientation':
      /informations|verifier/.test(normalize(title))?'Autres informations':'Médical';
    const result=[];
    for(const section of extract(pages)) {
      const key=normalize(section.title);
      if(duplicateSections.has(key) || key.startsWith('surveillance') || key==='informations generales') continue;
      const fields=section.cells?.length ? section.cells : key==='anamnese' || key==='patient' || key==="lieu d'intervention" || key==='declenchement smur' || key==='transport' || key==='admission' ? [] : [section];
      for(const field of fields) {
        if(duplicateLabels.has(normalize(field.title))) continue;
        if(key==='anamnese' && normalize(field.title).startsWith('autres precisions')) continue;
        let title=field.title;
        if(key==='requerant' && normalize(title)==="nom d'usage") title='Nom du requérant';
        if(key==='requerant' && normalize(title)==='prenom') title='Prénom du requérant';
        result.push({...field,title,page:section.page,group:groupFor(section.title),section:section.title,uncertain:section.uncertain});
      }
    }
    return cleanOptionalFields(mergeOptionalFields(result));
  }
  function cleanOptionalFields(fields) {
    const aliases={
      'Signe de detresse respiratoire aigue':'Détresse respiratoire aiguë',
      'Mouvements thoracique':'Mouvements thoraciques',
      'Pression du balonnet':'Pression du ballonnet',
      'VT (Volume courant)':'Volume courant (VT)',
      'Mode ventilatoire VI':'Mode ventilatoire',
      "Types de voies d'abord":"Type de voie d’abord",
      'Numéro composé en premier / Heure du 1er appel':'Premier appel',
      "Repère à l'arcade dentaire":'Repère dentaire',
      "Prise en charge réalisée avant l'arrivée du SMUR":'Soins avant le SMUR',
      "Heure d'arrivée des premiers secours":'Arrivée des premiers secours',
      'Date et heure du 1er symptôme':'Début des symptômes'
    };
    const seen=new Set();
    return fields.flatMap(field=>{
      const value=field.lines.join(' ').replace(/\s+/g,' ').trim();
      if(/^(?:nr|n\/?a|non renseigne|non renseignee|sans objet|[-–—])?$/i.test(normalize(value))) return [];
      // Residual author stamps and generic "Autre" labels add no clinical content.
      if(normalize(field.title).startsWith('autres precisions') && /^(?:par [\p{L}\d .’'-]+|autre)$/iu.test(value)) return [];
      let title=aliases[field.title] || field.title;
      title=title.replace(/Mouvements thoracique\b/,'Mouvements thoraciques');
      const key=JSON.stringify([field.group,normalize(title),normalize(value)]);
      if(seen.has(key)) return [];
      seen.add(key);
      return [{...field,title,lines:[value]}];
    });
  }
  root.extractOptionalFields=optionalFields;
  if(typeof module!=='undefined') module.exports={extractDocumentSections:extract,extractOptionalFields:optionalFields,mergeOptionalFields,cleanOptionalFields};
})(typeof window!=='undefined'?window:globalThis);
