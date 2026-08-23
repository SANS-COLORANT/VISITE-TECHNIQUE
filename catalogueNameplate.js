const NUM='(-?\\d+(?:[.,]\\d+)?)';
const clean=n=>Number(String(n).replace(',','.'));
function first(text,re){const m=text.match(re);return m?m[1]||m[0]:null;}
export function parseEquipmentNameplateText(raw=''){
  const text=String(raw).replace(/\s+/g,' ').trim();
  const upper=text.toUpperCase();
  const out={raw:text};
  const power=first(upper,new RegExp(NUM+'\\s*(KW|MW)\\b','i')); if(power){const unit=(upper.match(new RegExp(NUM+'\\s*(KW|MW)\\b','i'))||[])[2]?.toUpperCase();out.puissance_kw=unit==='MW'?clean(power)*1000:clean(power);}
  const voltage=first(upper,new RegExp(NUM+'\\s*V\\b','i')); if(voltage)out.tension_v=clean(voltage);
  const current=first(upper,new RegExp(NUM+'\\s*A\\b','i')); if(current)out.intensite_a=clean(current);
  const freq=first(upper,new RegExp(NUM+'\\s*HZ\\b','i')); if(freq)out.frequence_hz=clean(freq);
  const pressure=first(upper,new RegExp(NUM+'\\s*BAR\\b','i')); if(pressure)out.pression_bar=clean(pressure);
  const temp=first(upper,new RegExp(NUM+'\\s*°?C\\b','i')); if(temp)out.temperature_c=clean(temp);
  const flow=upper.match(new RegExp(NUM+'\\s*(M3/H|M³/H|L/S|L/H)','i')); if(flow){let v=clean(flow[1]),u=flow[2].toUpperCase();if(u==='L/S')v=v*3.6;else if(u==='L/H')v=v/1000;out.debit_m3h=Number(v.toFixed(3));}
  const dn=upper.match(/\bDN\s*[-:]?\s*(\d{1,4})\b/);if(dn)out.dn_mm=Number(dn[1]);
  const refrigerant=upper.match(/\b(R32|R410A|R407C|R134A|R1234ZE|R1234YF|R454B|R452B|R513A|R515B|R290|R744)\b/);if(refrigerant)out.fluide_frigorigene=refrigerant[1];
  const serial=upper.match(/(?:S\/?N|SERIAL|N[°O]\s*SERIE|NUMERO\s*DE\s*SERIE)\s*[:#-]?\s*([A-Z0-9._\/-]{4,})/i);if(serial)out.numero_serie=serial[1];
  const ip=upper.match(/\bIP\s*([0-6][0-9])\b/);if(ip)out.indice_ip='IP'+ip[1];
  const rpm=upper.match(/(\d{2,5})\s*(?:RPM|TR\/?MIN)\b/);if(rpm)out.vitesse_rpm=Number(rpm[1]);
  return out;
}
export function normalizeTechnicalValue(value,unit=''){
  const n=clean(value),u=String(unit).trim().toLowerCase();if(!Number.isFinite(n))return{value,unit};
  if(u==='mw')return{value:n*1000,unit:'kW'};
  if(u==='w')return{value:n/1000,unit:'kW'};
  if(u==='l/s')return{value:n*3.6,unit:'m³/h'};
  if(u==='l/h')return{value:n/1000,unit:'m³/h'};
  if(u==='kpa')return{value:n/100,unit:'bar'};
  if(u==='pa')return{value:n/100000,unit:'bar'};
  if(u==='mce')return{value:n*9.80665,unit:'kPa'};
  return{value:n,unit};
}
