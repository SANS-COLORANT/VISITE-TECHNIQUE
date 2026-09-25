import React from 'react';
import Svg, { Circle, G, Line, Path, Polyline, Rect } from 'react-native-svg';

const COMMON = Object.freeze({ fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' });

function CvcIcon({ name, size = 36, color = '#10384B', strokeWidth = 1.9 }) {
  const p = { ...COMMON, stroke: color, strokeWidth };
  const key = String(name || '').toLowerCase();
  let body = null;

  if (key === 'tools' || key === 'equipment') {
    body = <G {...p}>
      <Path d="M8 4.8a5.1 5.1 0 0 0 6.4 6.4L23 19.8a2.3 2.3 0 1 1-3.2 3.2l-8.6-8.6A5.1 5.1 0 0 1 4.8 8L8 11.2l3.2-3.2L8 4.8Z" />
      <Path d="m16.2 11.4 5.3-5.3 2.4-.8-.8 2.4-5.3 5.3" />
      <Line x1="6.4" y1="21.6" x2="13.7" y2="14.3" />
    </G>;
  } else if (key === 'meter' || key === 'counter') {
    body = <G {...p}>
      <Circle cx="14" cy="14" r="10" />
      <Path d="M7.7 18.7a7.5 7.5 0 1 1 12.6 0" />
      <Line x1="14" y1="14" x2="18.8" y2="9.7" />
      <Circle cx="14" cy="14" r="1.2" />
      <Rect x="9" y="19.2" width="10" height="3.3" rx="1" />
    </G>;
  } else if (key === 'temperature' || key === 'thermometer') {
    body = <G {...p}>
      <Path d="M12 5.5a3 3 0 0 1 6 0v10.1a5.2 5.2 0 1 1-6 0V5.5Z" />
      <Line x1="15" y1="7" x2="15" y2="18.5" />
      <Circle cx="15" cy="20.5" r="2.1" />
      <Line x1="19.7" y1="8.2" x2="22.8" y2="8.2" />
      <Line x1="19.7" y1="12.1" x2="22" y2="12.1" />
    </G>;
  } else if (key === 'distribution' || key === 'network') {
    body = <G {...p}>
      <Path d="M4 9h8v5h6v-4h6" />
      <Path d="M12 14v7h7" />
      <Circle cx="4.5" cy="9" r="1.5" />
      <Circle cx="24" cy="10" r="1.5" />
      <Circle cx="19" cy="21" r="1.5" />
      <Path d="M9.5 6.4h5v5h-5Z" />
    </G>;
  } else if (key === 'local' || key === 'building') {
    body = <G {...p}>
      <Path d="M5 24V8.5L14 4l9 4.5V24" />
      <Path d="M9 24v-6h10v6" />
      <Rect x="8" y="10" width="4" height="4" rx=".6" />
      <Rect x="16" y="10" width="4" height="4" rx=".6" />
      <Line x1="3" y1="24" x2="25" y2="24" />
    </G>;
  } else if (key === 'regulation' || key === 'controller') {
    body = <G {...p}>
      <Rect x="4" y="5" width="20" height="18" rx="3" />
      <Rect x="7.5" y="8" width="13" height="5" rx="1" />
      <Line x1="8" y1="17.5" x2="20" y2="17.5" />
      <Circle cx="10" cy="17.5" r="1.7" />
      <Line x1="8" y1="21" x2="20" y2="21" />
      <Circle cx="17" cy="21" r="1.7" />
    </G>;
  } else if (key === 'remark' || key === 'warning') {
    body = <G {...p}>
      <Path d="M14 4 25 23H3L14 4Z" />
      <Line x1="14" y1="10" x2="14" y2="16" />
      <Circle cx="14" cy="19.5" r=".9" fill={color} stroke="none" />
    </G>;
  } else if (key === 'photo' || key === 'camera') {
    body = <G {...p}>
      <Path d="M5 9h4l1.7-2.5h6.6L19 9h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2Z" />
      <Circle cx="14" cy="16" r="4.2" />
      <Circle cx="21.3" cy="12" r=".9" fill={color} stroke="none" />
    </G>;
  } else if (key === 'home') {
    body = <G {...p}>
      <Path d="M4 13.2 14 4l10 9.2" />
      <Path d="M6.5 11.8V24h15V11.8" />
      <Path d="M11 24v-7h6v7" />
    </G>;
  } else if (key === 'plate' || key === 'tag') {
    body = <G {...p}>
      <Rect x="4" y="6" width="20" height="16" rx="2.5" />
      <Circle cx="8.5" cy="10.3" r="1.2" />
      <Line x1="12" y1="10.3" x2="20.5" y2="10.3" />
      <Line x1="7.5" y1="15" x2="20.5" y2="15" />
      <Line x1="7.5" y1="18.7" x2="17" y2="18.7" />
    </G>;
  } else if (key === 'microphone' || key === 'mic') {
    body = <G {...p}>
      <Rect x="10" y="4" width="8" height="13" rx="4" />
      <Path d="M7.5 13.5a6.5 6.5 0 0 0 13 0" />
      <Line x1="14" y1="20" x2="14" y2="24" />
      <Line x1="10.5" y1="24" x2="17.5" y2="24" />
    </G>;
  } else if (key === 'plus' || key === 'add') {
    body = <G {...p}><Circle cx="14" cy="14" r="10" /><Line x1="14" y1="9" x2="14" y2="19" /><Line x1="9" y1="14" x2="19" y2="14" /></G>;
  } else if (key === 'eye' || key === 'view') {
    body = <G {...p}><Path d="M3.5 14s3.8-6.5 10.5-6.5S24.5 14 24.5 14 20.7 20.5 14 20.5 3.5 14 3.5 14Z" /><Circle cx="14" cy="14" r="3.2" /></G>;
  } else if (key === 'trash' || key === 'delete') {
    body = <G {...p}><Path d="M6.5 8h15" /><Path d="M10 8V5h8v3" /><Path d="M8.2 8 9.3 24h9.4l1.1-16" /><Line x1="12" y1="12" x2="12.6" y2="20" /><Line x1="16" y1="12" x2="15.4" y2="20" /></G>;
  } else if (key === 'document') {
    body = <G {...p}>
      <Path d="M7 3.8h9l5 5V24H7Z" />
      <Path d="M16 3.8V9h5" />
      <Line x1="10" y1="13" x2="18" y2="13" />
      <Line x1="10" y1="17" x2="18" y2="17" />
      <Line x1="10" y1="21" x2="16" y2="21" />
    </G>;
  } else if (key === 'cloud-check' || key === 'cloud-online') {
    body = <G {...p}>
      <Path d="M8.5 21.5h11.5a4.8 4.8 0 0 0 .4-9.6A6.5 6.5 0 0 0 7.8 11.55 5 5 0 0 0 8.5 21.5Z" />
      <Polyline points="10.5,16.5 13,19 18,13.5" />
    </G>;
  } else if (key === 'cloud-sync' || key === 'cloud-pending') {
    body = <G {...p}>
      <Path d="M8.5 21.5h11.5a4.8 4.8 0 0 0 .4-9.6A6.5 6.5 0 0 0 7.8 11.55 5 5 0 0 0 8.5 21.5Z" />
      <Path d="M11 15.3a3.3 3.3 0 0 1 5.6-1.7M17 12.4v2h-2" />
      <Path d="M17 17.7a3.3 3.3 0 0 1-5.6 1.7M11 20.6v-2h2" />
    </G>;
  } else if (key === 'cloud-off') {
    body = <G {...p}>
      <Path d="M8.5 21.5h11.5a4.8 4.8 0 0 0 .4-9.6A6.5 6.5 0 0 0 7.8 11.55 5 5 0 0 0 8.5 21.5Z" />
      <Line x1="4" y1="4" x2="24" y2="24" />
    </G>;
  } else if (key === 'device' || key === 'phone') {
    body = <G {...p}>
      <Rect x="8" y="3.5" width="12" height="21" rx="2.5" />
      <Line x1="8" y1="19.5" x2="20" y2="19.5" />
      <Circle cx="14" cy="21.7" r=".9" fill={color} stroke="none" />
    </G>;
  } else if (key === 'note' || key === 'edit') {
    body = <G {...p}>
      <Path d="M18.4 4.6a2.3 2.3 0 0 1 3.3 3.3L9.5 20.1l-4.4 1.1 1.1-4.4Z" />
      <Line x1="16.2" y1="6.8" x2="19.5" y2="10.1" />
    </G>;
  } else if (key === 'export' || key === 'download') {
    body = <G {...p}>
      <Path d="M14 4v13" />
      <Polyline points="9,12.5 14,17.5 19,12.5" />
      <Path d="M5 20h18" />
    </G>;
  } else if (key === 'gallery' || key === 'image') {
    body = <G {...p}>
      <Rect x="3.5" y="4.5" width="21" height="19" rx="2.5" />
      <Circle cx="10" cy="11" r="2.4" />
      <Path d="M4 20.5 10.5 13.5 15 17.5 19 13.5 24 19" />
    </G>;
  } else if (key === 'clock' || key === 'pending') {
    body = <G {...p}>
      <Circle cx="14" cy="14" r="10" />
      <Line x1="14" y1="14" x2="14" y2="8" />
      <Line x1="14" y1="14" x2="18.5" y2="16.5" />
    </G>;
  } else if (key === 'settings' || key === 'gear') {
    body = <G {...p}>
      <Circle cx="14" cy="14" r="8" />
      <Circle cx="14" cy="14" r="1.3" fill={color} stroke="none" />
      <Line x1="14" y1="2" x2="14" y2="5" />
      <Line x1="14" y1="23" x2="14" y2="26" />
      <Line x1="2" y1="14" x2="5" y2="14" />
      <Line x1="23" y1="14" x2="26" y2="14" />
      <Line x1="5.5" y1="5.5" x2="7.6" y2="7.6" />
      <Line x1="20.4" y1="20.4" x2="22.5" y2="22.5" />
      <Line x1="5.5" y1="22.5" x2="7.6" y2="20.4" />
      <Line x1="20.4" y1="7.6" x2="22.5" y2="5.5" />
    </G>;
  } else if (key === 'search') {
    body = <G {...p}>
      <Circle cx="12.5" cy="12.5" r="7.5" />
      <Line x1="17.8" y1="17.8" x2="24.5" y2="24.5" />
    </G>;
  } else if (key === 'control' || key === 'check') {
    body = <G {...p}>
      <Rect x="6" y="5.5" width="16" height="19" rx="2.5" />
      <Path d="M10 5.5V3.8h8v1.7" />
      <Polyline points="9,14 12,17 19,10" />
      <Line x1="10" y1="21" x2="18" y2="21" />
    </G>;
  } else {
    body = <G {...p}><Circle cx="14" cy="14" r="10" /><Path d="M9 14h10M14 9v10" /></G>;
  }

  return <Svg width={size} height={size} viewBox="0 0 28 28" accessibilityElementsHidden>{body}</Svg>;
}

export { CvcIcon };
