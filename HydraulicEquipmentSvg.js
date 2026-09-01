import React from 'react';
import { Svg, Rect, G } from 'react-native-svg';

const C = {
  ink: '#171816', steel: '#71869B', steel2: '#5F6060', panel: '#EFEEE8',
  cyan: '#44C5E9', cyan2: '#2BA7D3', cyanLight: '#82DBF3', blue: '#357DED',
  red: '#EF5A2A', orange: '#F4A91F', yellow: '#FFE473', purple: '#7C4CF0',
  grey: '#555651', smoke: '#AAA9A4', white: '#EDF7FF',
};

export const EQUIPMENT_TYPES = [
  { id: 'boiler', label: 'Chaudière', defaultLabel: 'Chaudière' },
  { id: 'pump', label: 'Pompe', defaultLabel: 'Pompe' },
  { id: 'twin_pump', label: 'Pompe double', defaultLabel: 'Pompe double' },
  { id: 'heat_exchanger', label: 'Échangeur', defaultLabel: 'Échangeur' },
  { id: 'three_way_valve', label: 'Vanne 3 voies', defaultLabel: 'V3V' },
  { id: 'vmc_box', label: 'Caisson VMC', defaultLabel: 'Caisson VMC' },
  { id: 'fan', label: 'Ventilateur', defaultLabel: 'Ventilateur' },
  { id: 'water_leak', label: "Fuite d'eau", defaultLabel: 'Fuite' },
];

export const PORTS_BY_TYPE = {
  boiler: [
    { id: 'supply', label: 'Aller', x: 38, y: 120 },
    { id: 'return', label: 'Retour', x: 90, y: 120 },
  ],
  pump: [
    { id: 'left', label: 'Entrée', x: 5, y: 72 },
    { id: 'right', label: 'Sortie', x: 123, y: 72 },
  ],
  twin_pump: [
    { id: 'left', label: 'Entrée', x: 13, y: 108 },
    { id: 'right', label: 'Sortie', x: 115, y: 108 },
  ],
  heat_exchanger: [
    { id: 'hot_left_top', label: 'Primaire haut', x: 5, y: 39 },
    { id: 'hot_left_bottom', label: 'Primaire bas', x: 5, y: 84 },
    { id: 'cold_right_top', label: 'Secondaire haut', x: 123, y: 39 },
    { id: 'cold_right_bottom', label: 'Secondaire bas', x: 123, y: 84 },
  ],
  three_way_valve: [
    { id: 'a', label: 'A', x: 5, y: 82 },
    { id: 'b', label: 'B', x: 123, y: 82 },
    { id: 'ab', label: 'AB', x: 64, y: 123 },
  ],
  vmc_box: [
    { id: 'left', label: 'Entrée air', x: 5, y: 64 },
    { id: 'right', label: 'Sortie air', x: 123, y: 64 },
  ],
  fan: [
    { id: 'left', label: 'Entrée air', x: 5, y: 64 },
    { id: 'right', label: 'Sortie air', x: 123, y: 64 },
  ],
  water_leak: [
    { id: 'left', label: 'Amont', x: 5, y: 36 },
    { id: 'right', label: 'Aval', x: 123, y: 36 },
  ],
};

export function equipmentTypeLabel(type) {
  return EQUIPMENT_TYPES.find((item) => item.id === type)?.label || type;
}

function statusColor(status) {
  if (status === 'fault') return '#D84A45';
  if (status === 'warning') return '#F4A91F';
  if (status === 'off') return '#8A8A84';
  return '#23B66B';
}

function StatusPixel({ x, y, status, outer = true }) {
  const fill = statusColor(status);
  return (
    <G>
      {outer ? <Rect x={x} y={y} width="12" height="12" fill={C.ink} /> : null}
      <Rect x={outer ? x + 3 : x} y={outer ? y + 3 : y} width={outer ? 6 : 7} height={outer ? 6 : 7} fill={fill} />
    </G>
  );
}

function Boiler({ phase, running, status }) {
  const pulse = running ? 0.75 + ((phase % 40) / 40) * 0.25 : 0.35;
  const smokeShift = running ? (phase % 28) : 0;
  return (
    <>
      <G>
        <Rect x="22" y="20" width="22" height="28" fill={C.ink}/><Rect x="27" y="25" width="12" height="18" fill={C.grey}/>
        <Rect x="16" y="44" width="96" height="8" fill={C.ink}/><Rect x="12" y="50" width="104" height="66" fill={C.ink}/>
        <Rect x="17" y="55" width="94" height="52" fill="#30312D"/><Rect x="20" y="58" width="50" height="45" fill={C.ink}/>
        <Rect x="75" y="58" width="31" height="45" fill={C.panel}/><Rect x="80" y="63" width="21" height="22" fill={C.ink}/>
        <Rect x="29" y="112" width="20" height="12" fill={C.ink}/><Rect x="79" y="112" width="20" height="12" fill={C.ink}/>
        <Rect x="34" y="116" width="12" height="5" fill={C.red}/><Rect x="82" y="116" width="13" height="5" fill={C.blue}/>
        <Rect x="22" y="62" width="4" height="18" fill="#F7F7F2"/>
        <Rect x="31" y="62" width="34" height="12" fill={C.cyan}/><Rect x="35" y="66" width="24" height="4" fill="#2697B8"/>
      </G>
      <G opacity={pulse}>
        <Rect x="33" y="88" width="30" height="12" fill={C.red}/><Rect x="37" y="82" width="22" height="14" fill={C.orange}/>
        <Rect x="42" y="77" width="12" height="11" fill="#F7BE2C"/><Rect x="45" y="91" width="7" height="9" fill={C.yellow}/>
      </G>
      <StatusPixel x={85} y={67} status={running ? status : 'off'} />
      {running ? (
        <G>
          <Rect x="24" y={12 - (smokeShift * 0.35)} width="6" height="6" fill={C.smoke} opacity="0.7"/>
          <Rect x="31" y={6 - (smokeShift * 0.5)} width="6" height="6" fill={C.smoke} opacity="0.52"/>
          <Rect x="24" y={0 - (smokeShift * 0.25)} width="5" height="5" fill={C.smoke} opacity="0.32"/>
        </G>
      ) : null}
    </>
  );
}

function Pump({ phase, running, status }) {
  const angle = running ? phase : 0;
  return (
    <>
      <G>
        <Rect x="8" y="63" width="28" height="21" fill={C.ink}/><Rect x="92" y="63" width="28" height="21" fill={C.ink}/>
        <Rect x="12" y="67" width="24" height="13" fill={C.steel2}/><Rect x="92" y="67" width="24" height="13" fill={C.steel2}/>
        <Rect x="14" y="70" width="6" height="6" fill="#5AA0FF"/><Rect x="108" y="70" width="6" height="6" fill="#5AA0FF"/>
        <Rect x="39" y="13" width="50" height="40" fill={C.ink}/><Rect x="44" y="18" width="35" height="11" fill="#51524F"/><Rect x="44" y="33" width="35" height="8" fill="#383935"/>
        <Rect x="82" y="18" width="13" height="13" fill={C.ink}/><Rect x="49" y="48" width="30" height="16" fill={C.ink}/><Rect x="56" y="52" width="16" height="10" fill="#61635F"/>
        <Rect x="34" y="57" width="60" height="48" fill={C.ink}/><Rect x="40" y="63" width="48" height="36" fill={C.steel}/>
      </G>
      <G transform={`rotate(${angle} 64 81)`}>
        <Rect x="58" y="63" width="12" height="36" fill={C.cyan}/><Rect x="46" y="75" width="36" height="12" fill={C.cyan}/>
        <Rect x="58" y="75" width="12" height="12" fill={C.white}/><Rect x="43" y="67" width="8" height="8" fill={C.cyanLight}/><Rect x="77" y="89" width="7" height="7" fill={C.cyan2}/>
      </G>
      <Rect x="16" y="69" width="5" height="5" fill="#8ABAFF"/><Rect x="106" y="69" width="5" height="5" fill="#8ABAFF"/>
      <Rect x="84" y="19" width="10" height="10" fill={statusColor(running ? status : 'off')}/>
    </>
  );
}

function TwinPump({ phase, running, status, secondaryRunning = true }) {
  const angle1 = running ? phase : 0;
  const angle2 = secondaryRunning ? -phase : 0;
  return (
    <>
      <G><Rect x="12" y="101" width="104" height="20" fill={C.ink}/><Rect x="18" y="106" width="92" height="9" fill={C.steel}/><Rect x="18" y="109" width="92" height="3" fill="#8DA2B5"/></G>
      <G>
        <Rect x="18" y="9" width="36" height="36" fill={C.ink}/><Rect x="23" y="14" width="14" height="11" fill="#4F504D"/>
        <Rect x="28" y="42" width="16" height="13" fill={C.ink}/><Rect x="20" y="52" width="32" height="40" fill={C.ink}/><Rect x="25" y="57" width="22" height="30" fill={C.steel}/>
        <G transform={`rotate(${angle1} 36 72)`}><Rect x="31" y="57" width="10" height="30" fill={C.cyan}/><Rect x="21" y="67" width="30" height="10" fill={C.cyan}/><Rect x="31" y="67" width="10" height="10" fill={C.white}/><Rect x="24" y="58" width="5" height="5" fill="#9DDFF3"/></G>
        <Rect x="42" y="17" width="7" height="7" fill={statusColor(running ? status : 'off')}/>
      </G>
      <G>
        <Rect x="74" y="9" width="36" height="36" fill={C.ink}/><Rect x="79" y="14" width="14" height="11" fill="#4F504D"/>
        <Rect x="84" y="42" width="16" height="13" fill={C.ink}/><Rect x="76" y="52" width="32" height="40" fill={C.ink}/><Rect x="81" y="57" width="22" height="30" fill={C.steel}/>
        <G transform={`rotate(${angle2} 92 72)`}><Rect x="87" y="57" width="10" height="30" fill={C.cyan}/><Rect x="77" y="67" width="30" height="10" fill={C.cyan}/><Rect x="87" y="67" width="10" height="10" fill={C.white}/><Rect x="99" y="80" width="5" height="5" fill={C.cyan2}/></G>
        <Rect x="98" y="17" width="7" height="7" fill={statusColor(secondaryRunning ? status : 'off')}/>
      </G>
    </>
  );
}

function HeatExchanger({ phase, running, status }) {
  const shift = running ? ((phase % 48) / 48) * 18 : 0;
  return (
    <>
      <G>
        <Rect x="31" y="19" width="66" height="94" fill={C.ink}/><Rect x="37" y="25" width="54" height="82" fill={C.steel}/>
        <Rect x="42" y="28" width="9" height="76" fill="#8398AD"/><Rect x="57" y="28" width="7" height="76" fill="#5F758C"/><Rect x="70" y="28" width="7" height="76" fill="#5F758C"/><Rect x="83" y="28" width="6" height="76" fill="#8298AD"/>
        <Rect x="42" y="22" width="20" height="18" fill={C.ink}/><Rect x="66" y="22" width="19" height="18" fill={C.ink}/>
        <Rect x="5" y="31" width="31" height="17" fill={C.ink}/><Rect x="5" y="76" width="31" height="17" fill={C.ink}/><Rect x="92" y="31" width="31" height="17" fill={C.ink}/><Rect x="92" y="76" width="31" height="17" fill={C.ink}/>
      </G>
      <G opacity={running ? 1 : 0.35}>
        <Rect x={10 + shift} y="36" width="15" height="7" fill={C.red}/><Rect x={10 + shift} y="81" width="15" height="7" fill={C.red}/>
        <Rect x={103 - shift} y="36" width="15" height="7" fill={C.blue}/><Rect x={103 - shift} y="81" width="15" height="7" fill={C.blue}/>
        <Rect x="37" y="35" width="8" height="10" fill={C.red}/><Rect x="37" y="54" width="8" height="10" fill={C.red}/><Rect x="37" y="73" width="8" height="10" fill={C.red}/>
        <Rect x="83" y="40" width="7" height="10" fill={C.cyan}/><Rect x="83" y="59" width="7" height="10" fill={C.cyan}/><Rect x="83" y="78" width="7" height="10" fill={C.cyan}/>
      </G>
      <Rect x="52" y="28" width="7" height="7" fill={statusColor(running ? status : 'off')}/>
    </>
  );
}

function ThreeWayValve({ status, valvePosition = 50 }) {
  const angle = -45 + (Math.max(0, Math.min(100, Number(valvePosition) || 0)) / 100) * 90;
  return (
    <>
      <G>
        <Rect x="14" y="71" width="36" height="22" fill={C.ink}/><Rect x="78" y="71" width="36" height="22" fill={C.ink}/><Rect x="53" y="91" width="22" height="31" fill={C.ink}/>
        <Rect x="19" y="76" width="31" height="12" fill={C.red}/><Rect x="78" y="76" width="31" height="12" fill={C.blue}/><Rect x="58" y="94" width="12" height="23" fill="#EF6A26"/>
        <Rect x="42" y="15" width="44" height="20" fill={C.ink}/><Rect x="47" y="20" width="34" height="7" fill={C.red}/><Rect x="37" y="30" width="54" height="48" fill={C.ink}/>
        <Rect x="44" y="36" width="28" height="26" fill={C.purple}/><Rect x="44" y="62" width="34" height="8" fill={C.purple}/><Rect x="48" y="72" width="32" height="29" fill={C.steel}/>
      </G>
      <G transform={`rotate(${angle} 64 84)`}><Rect x="61" y="71" width="6" height="18" fill={C.grey}/></G>
      <StatusPixel x={77} y={40} status={status} outer={false}/>
    </>
  );
}

function VmcBox({ phase, running, status }) {
  const angle = running ? phase : 0;
  const offset = running ? ((phase % 60) / 60) * 10 : 0;
  return (
    <>
      <G>
        <Rect x="14" y="18" width="100" height="92" fill={C.ink}/><Rect x="20" y="24" width="88" height="80" fill={C.panel}/><Rect x="26" y="30" width="76" height="68" fill="#F7F6F1"/>
        <Rect x="18" y="105" width="20" height="14" fill={C.ink}/><Rect x="90" y="105" width="20" height="14" fill={C.ink}/><Rect x="22" y="108" width="12" height="7" fill={C.grey}/><Rect x="94" y="108" width="12" height="7" fill={C.grey}/>
        <Rect x="44" y="40" width="40" height="48" fill={C.ink}/><Rect x="49" y="45" width="30" height="38" fill="#383935"/>
      </G>
      <G transform={`rotate(${angle} 64 64)`}><Rect x="60" y="46" width="8" height="36" fill={C.cyan}/><Rect x="46" y="60" width="36" height="8" fill={C.cyan}/><Rect x="60" y="60" width="8" height="8" fill={C.white}/><Rect x="50" y="48" width="7" height="7" fill={C.steel2}/><Rect x="72" y="74" width="6" height="6" fill={C.cyan2}/></G>
      <G opacity={running ? 1 : 0.25}><Rect x={4 + offset} y="49" width="10" height="5" fill="#5AA0FF"/><Rect x={7 + offset} y="64" width="7" height="5" fill="#5AA0FF"/><Rect x={3 + offset} y="79" width="11" height="5" fill="#5AA0FF"/><Rect x={114 - offset} y="49" width="10" height="5" fill="#9D63FF"/><Rect x={114 - offset} y="64" width="7" height="5" fill="#9D63FF"/><Rect x={114 - offset} y="79" width="11" height="5" fill="#9D63FF"/></G>
      <StatusPixel x={88} y={32} status={running ? status : 'off'} />
    </>
  );
}

function Fan({ phase, running, status }) {
  const angle = running ? phase : 0;
  return (
    <>
      <G><Rect x="17" y="17" width="94" height="94" fill={C.ink}/><Rect x="23" y="23" width="82" height="82" fill={C.steel}/><Rect x="30" y="30" width="68" height="68" fill="#F7F7F2"/><Rect x="19" y="20" width="9" height="9" fill="#333430"/><Rect x="100" y="20" width="9" height="9" fill="#333430"/><Rect x="19" y="99" width="9" height="9" fill="#333430"/><Rect x="100" y="99" width="9" height="9" fill="#333430"/></G>
      <G transform={`rotate(${angle} 64 64)`}><Rect x="60" y="35" width="8" height="58" fill={C.cyan}/><Rect x="35" y="60" width="58" height="8" fill={C.cyan}/><Rect x="60" y="60" width="8" height="8" fill={C.white}/><Rect x="47" y="47" width="8" height="8" fill={C.cyanLight}/><Rect x="73" y="73" width="8" height="8" fill={C.cyan2}/></G>
      <StatusPixel x={91} y={88} status={running ? status : 'off'} />
    </>
  );
}

function WaterLeak({ phase, running, status }) {
  const d1 = running ? (phase % 90) / 90 * 28 : 0;
  const d2 = running ? ((phase + 30) % 90) / 90 * 32 : 0;
  const d3 = running ? ((phase + 60) % 90) / 90 * 28 : 0;
  return (
    <>
      <G><Rect x="4" y="28" width="120" height="18" fill={C.ink}/><Rect x="4" y="33" width="120" height="8" fill={C.blue}/><Rect x="7" y="34" width="114" height="6" fill={C.blue}/></G>
      <G opacity={running ? 1 : 0.25}><Rect x="36" y={47 + d1} width="8" height="8" fill={C.cyan}/><Rect x="61" y={58 + d2} width="8" height="8" fill={C.cyan}/><Rect x="86" y={47 + d3} width="8" height="8" fill={C.cyan}/></G>
      <G><Rect x="57" y="79" width="14" height="14" fill={C.ink}/><Rect x="61" y="82" width="6" height="5" fill={C.orange}/><Rect x="63" y="89" width="2" height="2" fill={C.orange}/></G>
      <Rect x="105" y="12" width="10" height="10" fill={statusColor(status || 'fault')}/>
    </>
  );
}

export function EquipmentIcon({ type, size = 92, phase = 0, running = true, status = 'ok', valvePosition = 50, secondaryRunning = true }) {
  let content = null;
  if (type === 'boiler') content = <Boiler phase={phase} running={running} status={status} />;
  else if (type === 'pump') content = <Pump phase={phase} running={running} status={status} />;
  else if (type === 'twin_pump') content = <TwinPump phase={phase} running={running} status={status} secondaryRunning={secondaryRunning} />;
  else if (type === 'heat_exchanger') content = <HeatExchanger phase={phase} running={running} status={status} />;
  else if (type === 'three_way_valve') content = <ThreeWayValve status={status} valvePosition={valvePosition} />;
  else if (type === 'vmc_box') content = <VmcBox phase={phase} running={running} status={status} />;
  else if (type === 'fan') content = <Fan phase={phase} running={running} status={status} />;
  else if (type === 'water_leak') content = <WaterLeak phase={phase} running={running} status={status} />;
  else content = <Rect x="18" y="18" width="92" height="92" fill={C.steel} stroke={C.ink} strokeWidth="5" />;

  return <Svg width={size} height={size} viewBox="0 0 128 128">{content}</Svg>;
}
