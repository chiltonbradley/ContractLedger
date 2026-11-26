const clObj = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const clStr = { type: 'string' }, clNullable = { type: ['string', 'null'] }, clIntNull = { type: ['integer', 'null'] };
const clArr = items => ({ type: 'array', items });
const clEnum = values => ({ type: 'string', enum: values });
const clEvidenceSchema = clObj({ document: clStr, page: clIntNull, quote: clStr, confidence: { type: 'number' } });
export const CL_TERMS_SCHEMA = clObj({
  title: clStr, customer: clStr, currency: clStr, start: clNullable, end: clNullable,
  paymentTerms: clStr, terminationTerms: clStr, renewalTerms: clStr, materialTerms: clStr,
  charges: clArr(clObj({ id: clStr, label: clStr, classification: clEnum(['fixed', 'variable', 'included', 'non-606']),
    unitPriceDollars: clNullable, unit: clStr, minimumQuantity: clNullable, quantity: clNullable,
    billingCadence: { type: ['string','null'], enum: ['one-time','monthly','annual',null] },
    billingTiming: clStr, serviceStart: clNullable, serviceEnd: clNullable, evidence: clEvidenceSchema })),
  obligations: clArr(clObj({ id: clStr, label: clStr, transferPattern: clEnum(['over-time-daily','point-in-time','unresolved']),
    start: clNullable, end: clNullable, deliveryDate: clNullable, sspCents: clIntNull, judgment: clStr, evidence: clEvidenceSchema })),
  findings: clArr(clObj({ topic: clStr, status: clEnum(['supported','unresolved','not-applicable']), conclusion: clStr, guidance: clStr, evidence: clEvidenceSchema })),
  externalQuestions: clArr(clObj({ id: clStr, question: clStr, reason: clStr })), summary: clStr,
});

export function clValidate(schema, value, path = 'analysis') {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (!(types.includes(actual) || (actual === 'number' && types.includes('integer') && Number.isSafeInteger(value)))) throw Error(`${path}: invalid type`);
  if (schema.enum && !schema.enum.includes(value)) throw Error(`${path}: invalid choice`);
  if (actual === 'number' && !Number.isFinite(value)) throw Error(`${path}: invalid number`);
  if (actual === 'array') { if (value.length > 100) throw Error(`${path}: too many items`); value.forEach((v,i) => clValidate(schema.items,v,`${path}.${i}`)); }
  if (actual === 'object') {
    for (const key of schema.required || []) if (!(key in value)) throw Error(`${path}.${key}: missing`);
    for (const key of Object.keys(value)) { if (!schema.properties[key]) throw Error(`${path}.${key}: unexpected field`); clValidate(schema.properties[key],value[key],`${path}.${key}`); }
  }
  if (actual === 'string' && value.length > 20000) throw Error(`${path}: too long`);
  return value;
}

export function clFraction(value) {
  if (typeof value !== 'string' || !/^\d{1,12}(?:\.\d{1,12})?$/.test(value)) throw Error('Use an exact nonnegative decimal string.');
  const [whole, fraction = ''] = value.split('.');
  return [BigInt(whole + fraction), 10n ** BigInt(fraction.length)];
}
export function clMoney(rate, quantity) {
  const [r,rd] = clFraction(rate), [q,qd] = clFraction(quantity);
  const den = rd * qd, numerator = r * q * 100n;
  const cents = (numerator + den / 2n) / den;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Amount exceeds supported range.');
  return Number(cents);
}
export function clDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(date + 'T00:00:00Z');
  return Number.isFinite(+d) && d.toISOString().slice(0,10) === date ? d : null;
}
export function clMonths(start, end) {
  const s = clDate(start), e = clDate(end); if (!s || !e || e < s) return [];
  const result = []; let d = new Date(Date.UTC(s.getUTCFullYear(),s.getUTCMonth(),1));
  while (d <= e && result.length < 120) { result.push(d.toISOString().slice(0,7)); d.setUTCMonth(d.getUTCMonth()+1); }
  if (d <= e) throw Error('Review terms longer than ten years separately.');
  return result;
}
export function clDailyAllocation(cents, start, end) {
  const s=clDate(start), e=clDate(end); if (!s || !e || e<s) throw Error('Recognition dates are unresolved.');
  const total=BigInt(Math.round((e-s)/86400000)+1); let cumulative=0n, previous=0;
  return clMonths(start,end).map(month=>{
    const first=clDate(month+'-01'), next=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,1));
    const last=new Date(+next-86400000), from=new Date(Math.max(+s,+first)), to=new Date(Math.min(+e,+last));
    cumulative+=BigInt(Math.round((to-from)/86400000)+1);
    const rounded=Number((BigInt(cents)*cumulative+total/2n)/total), amount=rounded-previous;previous=rounded;
    return {month,cents:amount};
  });
}
export function clLegacyRate(charge) {
  if (charge.classification==='included') return '0';
  if (charge.unitPriceDollars !== undefined) return charge.unitPriceDollars;
  const matches=[...`${charge.billingTiming||''} ${charge.label||''} ${charge.evidence?.quote||''}`.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)].map(m=>m[1]);
  const rates=[...new Set(matches)]; return rates.length===1?rates[0]:null;
}
export function clCohortAllocation(cents,start,months,termination=null) {
  const d=clDate(start);if(!d||!Number.isSafeInteger(months)||months<1||months>120)throw Error('Cohort start and recognition months must be established.');
  if(termination!==null&&!clDate(termination))throw Error('Official termination date is invalid.');
  if(termination&&clDate(termination)<d)throw Error('A cohort cannot start after official termination.');
  let previous=0;const result=[];
  for(let i=0;i<months;i++){
    const date=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+i,1)),month=date.toISOString().slice(0,7);
    if(termination&&month>termination.slice(0,7))break;
    const cumulative=termination&&month===termination.slice(0,7)?cents:Number((BigInt(cents)*BigInt(i+1)+BigInt(months)/2n)/BigInt(months));
    result.push({month,cents:cumulative-previous});previous=cumulative;
    if(termination&&month===termination.slice(0,7))break;
  }
  return result;
}
export async function clHash(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function clCanonical(value) {
  if (Array.isArray(value)) return '['+value.map(clCanonical).join(',')+']';
  if (value && typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+clCanonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}

export function clSchedule(record, company) {
  const t=record.terms, review=record.review || {}, blockers=[];
  if(!t) return {blockers:['Read the full contract packet first.'],rows:[],journals:[]};
  if(record.analysisDirty) blockers.push('Material facts or answers changed. Reanalyze the saved corrections, then verify the refreshed conclusions.');
  const months=clMonths(t.start,t.end);
  if(!months.length) blockers.push('Confirm the enforceable start and end dates.');
  if(t.currency!=='USD') blockers.push('This initial calculation engine supports USD; review other currency precision before approval.');
  if(record.position!=='payee') blockers.push('ASC 606 revenue review applies to contracts with your customers; payer-side expense accounting needs a separate review.');
  if(!company.policyApproved || !company.policies?.trim()) blockers.push('Approve the company accounting policy and its supporting basis.');
  if(!review.accountingReviewed) blockers.push('Complete professional review of the proposed accounting conclusions.');
  if(!review.performanceConfirmedThrough || review.performanceConfirmedThrough<t.end) blockers.push('Performance evidence does not cover the full schedule; future revenue remains a plan.');
  if(!review.openingConfirmed || !clDate(review.openingDate) || !review.openingEvidence) blockers.push('Confirm opening deferred revenue/contract asset balances, date, and evidence.');
  if(review.openingDate!==t.start) blockers.push('Opening balances must be dated at the reviewed schedule start; migration mid-term requires a separate opening-books calculation.');
  for(const f of t.findings) if(f.status==='unresolved') blockers.push(`${f.topic}: ${f.conclusion}`);
  const rows=months.map(month=>({month, fixedCents:0, actualVariableCents:0, planningVariableCents:0, revenueCents:0, billedCents:null, deferredCents:null, contractAssetCents:null, classification:'plan'}));
  const byMonth=Object.fromEntries(rows.map(r=>[r.month,r]));
  const ensureMonth=month=>{if(!byMonth[month]){const r={month,fixedCents:0,actualVariableCents:0,planningVariableCents:0,revenueCents:0,billedCents:null,deferredCents:null,contractAssetCents:null,classification:'plan'};rows.push(r);byMonth[month]=r;}return byMonth[month];};
  const recognition=review.recognition||{}, fixed=[];
  const qtyFor=c=>c.minimumQuantity ?? c.quantity;
  for(const c of t.charges) {
    const rate=clLegacyRate(c), qty=qtyFor(c);
    if(c.classification==='included') continue;
    if(c.classification==='non-606') {blockers.push(`${c.label}: non-606 component requires a separate accounting treatment.`);continue;}
    if(rate===null || !c.billingCadence) {blockers.push(`${c.label}: rate or billing cadence unresolved.`);continue;}
    try {clFraction(rate);if(qty!==null)clFraction(qty);} catch {blockers.push(`${c.label}: invalid exact rate or quantity.`);continue;}
    const mapping=recognition[c.id];
    if(!mapping || !t.obligations.some(o=>o.id===mapping.obligationId)) {blockers.push(`${c.label}: assign a performance obligation.`);continue;}
    if(c.classification==='fixed') {
      if(qty===null) {blockers.push(`${c.label}: contractual quantity or minimum is unknown.`);continue;}
      const cs=c.serviceStart||t.start,ce=c.serviceEnd||t.end,cm=clMonths(cs,ce);
      if(!cm.length) {blockers.push(`${c.label}: service period unresolved.`);continue;}
      const amount=clMoney(rate,qty);let total=0;
      if(c.billingCadence==='one-time') total=amount;
      else if(c.billingCadence==='monthly') {
        // A partial service month needs a reviewed proration convention, never an assumed full charge.
        if(cs.slice(8)!=='01' || +clDate(ce)!==+new Date(Date.UTC(Number(ce.slice(0,4)),Number(ce.slice(5,7)),0))) {
          blockers.push(`${c.label}: partial-period billing needs an explicit reviewed amount.`);continue;
        }
        total=amount*cm.length;
      } else {
        if(cm.length%12 || cs.slice(8)!=='01' || +clDate(ce)!==+new Date(Date.UTC(Number(ce.slice(0,4)),Number(ce.slice(5,7)),0))) {blockers.push(`${c.label}: annual/partial term requires explicit reviewed billing.`);continue;}
        total=amount*(cm.length/12);
      }
      if(!Number.isSafeInteger(total)||!Number.isSafeInteger(fixed.reduce((n,x)=>n+x.total,0)+total)){blockers.push(`${c.label}: amount exceeds supported precision.`);continue;}
      fixed.push({charge:c,mapping,total,start:cs,end:ce});
    } else {
      const actual=(record.activity||[]).filter(a=>a.chargeId===c.id && a.kind==='actual');
      const planned=(record.activity||[]).filter(a=>a.chargeId===c.id && a.kind==='plan');
      if(!mapping.variableAllocationApproved) blockers.push(`${c.label}: review variable consideration constraints and allocation exception before recognition.`);
      for(const month of months) {
        const matches=actual.filter(a=>a.month===month), estimates=planned.filter(a=>a.month===month);
        if(matches.length>1) {byMonth[month]._actualMissing=true;blockers.push(`${c.label}, ${month}: overlapping actual support.`);continue;}
        if(matches.length===1) {
          const a=matches[0];if(!a.evidenceHash || !record.support?.some(s=>s.hash===a.evidenceHash)) {byMonth[month]._actualMissing=true;blockers.push(`${c.label}, ${month}: attach actual-consumption evidence.`);continue;}
          if(a.quantity===null || a.quantity===undefined) {byMonth[month]._actualMissing=true;continue;}
          const cents=clMoney(rate,a.quantity);
          if(mapping.method==='cohort-monthly') {
            if(c.billingCadence!=='one-time'||!mapping.cohortPolicyApproved||!mapping.cohortPolicyBasis?.trim()||!clDate(a.cohortStart)||a.cohortStart.slice(0,7)!==month){blockers.push(`${c.label}, ${month}: cohort recognition requires the actual cohort start, one-time billing, and an approved company-specific policy basis.`);continue;}
            let termination=null;
            if(review.officialTerminationDate){if(!review.officialTerminationConfirmed||!record.support?.some(s=>s.hash===review.officialTerminationEvidenceHash)){blockers.push('Official termination needs an explicit confirmation and supporting file; no deferral release was assumed.');continue;}termination=review.officialTerminationDate;}
            try {for(const p of clCohortAllocation(cents,a.cohortStart,Number(mapping.recognitionMonths),termination)){const row=ensureMonth(p.month);row.actualVariableCents+=p.cents;if(mapping.variableAllocationApproved)row.revenueCents+=p.cents;}}
            catch{blockers.push(`${c.label}: cohort recognition months are unresolved.`);}
          } else {byMonth[month].actualVariableCents+=cents;if(mapping.variableAllocationApproved) byMonth[month].revenueCents+=cents;}
        } else if(estimates.length===1 && estimates[0].quantity!==null) byMonth[month].planningVariableCents+=clMoney(rate,estimates[0].quantity);
        if(matches.length===0) {byMonth[month]._actualMissing=true;blockers.push(`${c.label}, ${month}: actual activity is unknown (a planning estimate is not earned revenue).`);}
      }
    }
  }
  const totalFixed=fixed.reduce((n,x)=>n+x.total,0), obligations=t.obligations.filter(o=>fixed.some(x=>x.mapping.obligationId===o.id));
  let allocations=new Map();
  if(obligations.length===1) allocations.set(obligations[0].id,totalFixed);
  else if(obligations.length>1) {
    if(obligations.some(o=>!Number.isSafeInteger(o.sspCents)||o.sspCents<=0)) blockers.push('Multiple performance obligations require supported relative standalone selling prices.');
    else {
      const sum=obligations.reduce((n,o)=>n+BigInt(o.sspCents),0n);
      const shares=obligations.map(o=>{const n=BigInt(totalFixed)*BigInt(o.sspCents);return {id:o.id,cents:Number(n/sum),remainder:n%sum};});
      let remaining=totalFixed-shares.reduce((n,s)=>n+s.cents,0);
      const ranked=[...shares].sort((a,b)=>a.remainder===b.remainder?a.id.localeCompare(b.id):a.remainder>b.remainder?-1:1);
      for(const s of ranked){if(!remaining)break;s.cents++;remaining--;}
      shares.forEach(s=>allocations.set(s.id,s.cents));
    }
  }
  for(const o of obligations) {
    if(!allocations.has(o.id))continue;
    const cents=allocations.get(o.id), mappings=fixed.filter(x=>x.mapping.obligationId===o.id).map(x=>x.mapping), method=mappings[0]?.method;
    if(mappings.some(m=>m.method!==method)){blockers.push(`${o.label}: conflicting recognition methods.`);continue;}
    if(method==='over-time-daily') {
      try{for(const a of clDailyAllocation(cents,o.start||t.start,o.end||t.end))if(byMonth[a.month]){byMonth[a.month].fixedCents+=a.cents;byMonth[a.month].revenueCents+=a.cents;}}
      catch{blockers.push(`${o.label}: recognition dates unresolved.`);}
    } else if(method==='point-in-time') {
      const date=mappings[0].deliveryDate||o.deliveryDate;if(!clDate(date)||!byMonth[date.slice(0,7)])blockers.push(`${o.label}: dated delivery evidence is required.`);
      else {byMonth[date.slice(0,7)].fixedCents+=cents;byMonth[date.slice(0,7)].revenueCents+=cents;}
    } else if(method==='manual') {
      const lines=(review.manualRecognition||[]).filter(p=>p.obligationId===o.id);
      if(!lines.length||lines.some(p=>!byMonth[p.month]||!Number.isSafeInteger(p.amountCents)||p.amountCents<0||!record.support?.some(s=>s.hash===p.evidenceHash))||lines.reduce((n,p)=>n+p.amountCents,0)!==cents)blockers.push(`${o.label}: manual recognition must reconcile to the allocation and link each period to reviewed support.`);
      else for(const p of lines){byMonth[p.month].fixedCents+=p.amountCents;byMonth[p.month].revenueCents+=p.amountCents;}
    } else blockers.push(`${o.label}: choose and substantiate the recognition method.`);
  }
  const accounts=review.accounts||{};
  for(const role of ['receivable','revenue','deferred','contractAsset'])if(!accounts[role]?.trim())blockers.push(`Map the ${role} GL account.`);
  let net=Number.isSafeInteger(review.openingDeferredCents)&&review.openingDeferredCents>=0&&Number.isSafeInteger(review.openingAssetCents)&&review.openingAssetCents>=0?review.openingDeferredCents-review.openingAssetCents:null;
  if(net===null)blockers.push('Opening amounts must be explicitly confirmed nonnegative integer cents, including actual zero.');
  const journals=[];
  rows.sort((a,b)=>a.month.localeCompare(b.month));
  for(const row of rows) {
    if(row._actualMissing){row.actualVariableCents=null;row.revenueCents=null;}delete row._actualMissing;
    const billing=(record.billing||[]).filter(b=>b.month===row.month), confirmed=review.billingCompleteThrough && review.billingCompleteThrough>=row.month;
    if(new Set(billing.map(b=>`${b.evidenceHash}:${b.invoiceReference}:${b.amountCents}`)).size!==billing.length)blockers.push(`${row.month}: duplicate billing support requires reconciliation.`);
    if(confirmed) {
      if(billing.some(b=>!Number.isSafeInteger(b.amountCents)||b.amountCents<0||!record.support?.some(s=>s.hash===b.evidenceHash)))blockers.push(`${row.month}: billing must link to evidence and valid amounts.`);
      else row.billedCents=billing.reduce((n,b)=>n+b.amountCents,0);
    } else blockers.push(`${row.month}: confirm billing completeness, including actual zero billing.`);
    if(net!==null && row.billedCents!==null && row.revenueCents!==null) {
      const prior=net;net+=row.billedCents-row.revenueCents;
      row.deferredCents=Math.max(net,0);row.contractAssetCents=Math.max(-net,0);
      const lines=[];const line=(account,debitCents,creditCents)=>{if(debitCents||creditCents)lines.push({account,debitCents,creditCents});};
      line(accounts.receivable,row.billedCents,0);line(accounts.revenue,0,row.revenueCents);
      const deferredChange=Math.max(net,0)-Math.max(prior,0),assetChange=Math.max(-net,0)-Math.max(-prior,0);
      line(accounts.deferred,Math.max(-deferredChange,0),Math.max(deferredChange,0));line(accounts.contractAsset,Math.max(assetChange,0),Math.max(-assetChange,0));
      if(lines.reduce((n,l)=>n+l.debitCents-l.creditCents,0)!==0)blockers.push(`${row.month}: journal does not balance.`);
      journals.push({month:row.month,description:`Contract revenue and billing — ${t.customer}`,lines});
    } else net=null;
    const endOfMonth=new Date(Date.UTC(Number(row.month.slice(0,4)),Number(row.month.slice(5,7)),0)).toISOString().slice(0,10);
    row.classification=review.performanceConfirmedThrough>=endOfMonth?'actual-supported':'plan';
  }
  return {engineVersion:'cl-2026-11-25.1',transactionPriceFixedCents:totalFixed,variableConsideration:'Actual amounts only; estimates excluded from recognized revenue',rows,journals,blockers:[...new Set(blockers)]};
}
