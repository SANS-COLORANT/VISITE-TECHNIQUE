import React from 'react';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';

const n = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const deg = (value) => n(value) * Math.PI / 180;

export const LAB3D_RENDER_COLORS = Object.freeze({
  bg: '#07121E', gridMinor: '#123A55', gridMajor: '#1B6D96', cyan: '#5DD8FF',
  axisX: '#FF6B6B', axisY: '#55C7FF', axisZ: '#78E08F', wall: '#82939D', floor: '#61727C',
});

export function cameraPoint3d(point, viewport, camera) {
  const scale = n(camera.zoom, 52);
  const yaw = deg(camera.yaw || 45);
  const pitch = deg(clamp(n(camera.pitch, 30), 5, 90));
  const dx = n(point.x) - n(camera.targetX);
  const dy = n(point.y) - n(camera.targetY);
  const dz = n(point.z) - n(camera.targetZ);
  const rx = dx * Math.cos(yaw) - dy * Math.sin(yaw);
  const ry = dx * Math.sin(yaw) + dy * Math.cos(yaw);
  const cx = viewport.width / 2 + n(camera.offsetX);
  const cy = viewport.height * 0.56 + n(camera.offsetY);
  return {
    x: cx + rx * scale,
    y: cy + (ry * Math.sin(pitch) - dz * Math.cos(pitch)) * scale,
    depth: ry * Math.cos(pitch) + dz * Math.sin(pitch),
  };
}

export function project3d(point, viewport, camera) {
  const projected = cameraPoint3d(point, viewport, camera);
  return { x: projected.x, y: projected.y };
}

function polygonPoints(points, viewport, camera) {
  return points.map((point) => {
    const p = project3d(point, viewport, camera);
    return `${p.x},${p.y}`;
  }).join(' ');
}

function rotatedLocal(base, lx, ly) {
  const r = deg(base.rotation_deg || 0);
  return {
    x: n(base.x) + lx * Math.cos(r) - ly * Math.sin(r),
    y: n(base.y) + lx * Math.sin(r) + ly * Math.cos(r),
  };
}

function partObject(base, part) {
  const p = rotatedLocal(base, n(part.x), n(part.y));
  return {
    ...base,
    x: p.x,
    y: p.y,
    z: n(base.z) + n(part.z),
    width: Math.max(0.02, n(part.width, n(base.width, 1))),
    depth: Math.max(0.02, n(part.depth, n(base.depth, 0.6))),
    height: Math.max(0.02, n(part.height, n(base.height, 1))),
    rotation_deg: n(base.rotation_deg) + n(part.rotation_deg),
  };
}

export function CuboidSolid({ object, viewport, camera, fill = '#7891A2', selected = false, opacity = 1, stroke = null }) {
  const width = Math.max(0.01, n(object.width, 1));
  const depth = Math.max(0.01, n(object.depth, 0.6));
  const height = Math.max(0.01, n(object.height, 1));
  const hw = width / 2;
  const hd = depth / 2;
  const r = deg(object.rotation_deg || 0);
  const rotate = (px, py) => ({
    x: n(object.x) + px * Math.cos(r) - py * Math.sin(r),
    y: n(object.y) + px * Math.sin(r) + py * Math.cos(r),
  });
  const a = rotate(-hw, -hd); const b = rotate(hw, -hd); const c = rotate(hw, hd); const d = rotate(-hw, hd);
  const z = n(object.z);
  const bottom = [a, b, c, d].map((p) => ({ ...p, z }));
  const top = [a, b, c, d].map((p) => ({ ...p, z: z + height }));
  const faces = [
    { points: [bottom[0], bottom[1], top[1], top[0]], shade: 0.58 },
    { points: [bottom[1], bottom[2], top[2], top[1]], shade: 0.78 },
    { points: [bottom[2], bottom[3], top[3], top[2]], shade: 0.66 },
    { points: [bottom[3], bottom[0], top[0], top[3]], shade: 0.72 },
    { points: top, shade: 0.98 },
  ].map((face, index) => ({
    ...face,
    key: index,
    depth: face.points.reduce((sum, point) => sum + cameraPoint3d(point, viewport, camera).depth, 0) / face.points.length,
  })).sort((left, right) => left.depth - right.depth);
  const outline = selected ? LAB3D_RENDER_COLORS.cyan : (stroke || '#C7D8E0');
  return <>{faces.map((face) => <Polygon key={face.key} points={polygonPoints(face.points, viewport, camera)} fill={fill} opacity={opacity * face.shade} stroke={outline} strokeWidth={selected ? 2.2 : 0.65} />)}</>;
}

function PrismSolid({ object, viewport, camera, fill, selected = false, sides = 10, opacity = 1 }) {
  const rx = Math.max(0.03, n(object.width, 0.6) / 2);
  const ry = Math.max(0.03, n(object.depth, 0.6) / 2);
  const z0 = n(object.z);
  const z1 = z0 + Math.max(0.03, n(object.height, 1));
  const ring0 = [];
  const ring1 = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (Math.PI * 2 * i) / sides;
    const local = rotatedLocal(object, Math.cos(angle) * rx, Math.sin(angle) * ry);
    ring0.push({ ...local, z: z0 });
    ring1.push({ ...local, z: z1 });
  }
  const faces = [];
  for (let i = 0; i < sides; i += 1) {
    const next = (i + 1) % sides;
    const points = [ring0[i], ring0[next], ring1[next], ring1[i]];
    faces.push({ key: `s-${i}`, points, shade: 0.62 + (i % 3) * 0.07, depth: points.reduce((sum, p) => sum + cameraPoint3d(p, viewport, camera).depth, 0) / 4 });
  }
  faces.push({ key: 'top', points: ring1, shade: 0.96, depth: ring1.reduce((sum, p) => sum + cameraPoint3d(p, viewport, camera).depth, 0) / sides });
  faces.sort((a, b) => a.depth - b.depth);
  return <>{faces.map((face) => <Polygon key={face.key} points={polygonPoints(face.points, viewport, camera)} fill={fill} opacity={opacity * face.shade} stroke={selected ? LAB3D_RENDER_COLORS.cyan : '#D1DFE6'} strokeWidth={selected ? 2.1 : 0.6} />)}</>;
}

function AccentBand({ object, viewport, camera, skin, ratio = 0.06 }) {
  const part = partObject(object, {
    x: 0,
    y: -n(object.depth, 0.6) / 2 - 0.015,
    z: n(object.height, 1) * 0.72,
    width: n(object.width, 1) * 0.72,
    depth: 0.03,
    height: Math.max(0.04, n(object.height, 1) * ratio),
  });
  return <CuboidSolid object={part} viewport={viewport} camera={camera} fill={skin.accent} opacity={0.96} />;
}

function BoilerModel({ object, viewport, camera, skin, selected }) {
  const w = n(object.width, 1.4); const d = n(object.depth, 0.9); const h = n(object.height, 1.55);
  const body = partObject(object, { z: h * 0.05, width: w * 0.94, depth: d * 0.92, height: h * 0.90 });
  const front = partObject(object, { y: -d * 0.48, z: h * 0.13, width: w * 0.72, depth: d * 0.05, height: h * 0.62 });
  const burner = partObject(object, { y: -d * 0.62, z: h * 0.28, width: w * 0.36, depth: d * 0.28, height: h * 0.22 });
  const flue = partObject(object, { x: w * 0.24, z: h * 0.95, width: w * 0.16, depth: w * 0.16, height: h * 0.16 });
  return <>
    <CuboidSolid object={body} viewport={viewport} camera={camera} fill={skin.primary} selected={selected} />
    <CuboidSolid object={front} viewport={viewport} camera={camera} fill={skin.secondary} />
    <CuboidSolid object={burner} viewport={viewport} camera={camera} fill={skin.dark} />
    <CuboidSolid object={flue} viewport={viewport} camera={camera} fill={skin.dark} />
    <AccentBand object={object} viewport={viewport} camera={camera} skin={skin} />
  </>;
}

function PumpModel({ object, viewport, camera, skin, selected }) {
  const w = n(object.width, 0.75); const d = n(object.depth, 0.45); const h = n(object.height, 0.55);
  const body = partObject(object, { z: h * 0.18, width: w * 0.38, depth: d * 0.72, height: h * 0.52 });
  const motor = partObject(object, { x: w * 0.20, z: h * 0.30, width: w * 0.42, depth: d * 0.58, height: h * 0.44 });
  const left = partObject(object, { x: -w * 0.36, z: h * 0.28, width: w * 0.28, depth: d * 0.48, height: h * 0.30 });
  const right = partObject(object, { x: w * 0.36, z: h * 0.28, width: w * 0.28, depth: d * 0.48, height: h * 0.30 });
  const foot = partObject(object, { z: 0, width: w * 0.72, depth: d * 0.86, height: h * 0.12 });
  return <>
    <CuboidSolid object={foot} viewport={viewport} camera={camera} fill={skin.dark} />
    <CuboidSolid object={left} viewport={viewport} camera={camera} fill={skin.secondary} />
    <CuboidSolid object={right} viewport={viewport} camera={camera} fill={skin.secondary} />
    <CuboidSolid object={body} viewport={viewport} camera={camera} fill={skin.dark} selected={selected} />
    <CuboidSolid object={motor} viewport={viewport} camera={camera} fill={skin.primary} selected={selected} />
  </>;
}

function CylinderEquipment({ object, viewport, camera, skin, selected, controller = false }) {
  const h = n(object.height, 1.2); const d = Math.min(n(object.width, 0.7), n(object.depth, 0.7));
  const cylinder = partObject(object, { z: h * 0.03, width: d * 0.84, depth: d * 0.84, height: h * 0.90 });
  const foot = partObject(object, { z: 0, width: d * 0.60, depth: d * 0.60, height: h * 0.05 });
  const top = partObject(object, { z: h * 0.91, width: d * 0.40, depth: d * 0.40, height: h * 0.06 });
  const control = partObject(object, { y: -d * 0.43, z: h * 0.68, width: d * 0.48, depth: d * 0.16, height: h * 0.18 });
  return <>
    <CuboidSolid object={foot} viewport={viewport} camera={camera} fill={skin.dark} />
    <PrismSolid object={cylinder} viewport={viewport} camera={camera} fill={skin.primary} selected={selected} />
    <CuboidSolid object={top} viewport={viewport} camera={camera} fill={skin.secondary} />
    {controller ? <CuboidSolid object={control} viewport={viewport} camera={camera} fill={skin.dark} /> : null}
  </>;
}

function ExchangerModel({ object, viewport, camera, skin, selected }) {
  const w = n(object.width, 0.9); const d = n(object.depth, 0.5); const h = n(object.height, 1.2);
  const frame = partObject(object, { z: h * 0.12, width: w * 0.72, depth: d * 0.68, height: h * 0.74 });
  const plate1 = partObject(object, { z: h * 0.18, width: w * 0.58, depth: d * 0.78, height: h * 0.62 });
  const footL = partObject(object, { x: -w * 0.28, z: 0, width: w * 0.12, depth: d * 0.76, height: h * 0.14 });
  const footR = partObject(object, { x: w * 0.28, z: 0, width: w * 0.12, depth: d * 0.76, height: h * 0.14 });
  return <>
    <CuboidSolid object={footL} viewport={viewport} camera={camera} fill={skin.dark} />
    <CuboidSolid object={footR} viewport={viewport} camera={camera} fill={skin.dark} />
    <CuboidSolid object={frame} viewport={viewport} camera={camera} fill={skin.secondary} selected={selected} />
    <CuboidSolid object={plate1} viewport={viewport} camera={camera} fill={skin.primary} selected={selected} />
    <AccentBand object={object} viewport={viewport} camera={camera} skin={skin} ratio={0.045} />
  </>;
}

function AirBoxModel({ object, viewport, camera, skin, selected }) {
  const w = n(object.width, 1.2); const d = n(object.depth, 0.8); const h = n(object.height, 0.8);
  const body = partObject(object, { z: h * 0.06, width: w * 0.94, depth: d * 0.90, height: h * 0.84 });
  const panel = partObject(object, { y: -d * 0.47, z: h * 0.18, width: w * 0.62, depth: d * 0.04, height: h * 0.48 });
  const inlet = partObject(object, { x: -w * 0.52, z: h * 0.28, width: w * 0.18, depth: d * 0.56, height: h * 0.38 });
  const outlet = partObject(object, { x: w * 0.52, z: h * 0.28, width: w * 0.18, depth: d * 0.56, height: h * 0.38 });
  return <>
    <CuboidSolid object={body} viewport={viewport} camera={camera} fill={skin.primary} selected={selected} />
    <CuboidSolid object={panel} viewport={viewport} camera={camera} fill={skin.secondary} />
    <CuboidSolid object={inlet} viewport={viewport} camera={camera} fill={skin.dark} />
    <CuboidSolid object={outlet} viewport={viewport} camera={camera} fill={skin.dark} />
    <AccentBand object={object} viewport={viewport} camera={camera} skin={skin} ratio={0.04} />
  </>;
}

function CabinetModel({ object, viewport, camera, skin, selected }) {
  const w = n(object.width, 0.8); const d = n(object.depth, 0.35); const h = n(object.height, 1.8);
  const body = partObject(object, { width: w * 0.96, depth: d * 0.94, height: h * 0.98 });
  const door = partObject(object, { y: -d * 0.49, z: h * 0.08, width: w * 0.82, depth: d * 0.04, height: h * 0.80 });
  const handle = partObject(object, { x: w * 0.33, y: -d * 0.53, z: h * 0.47, width: w * 0.045, depth: d * 0.05, height: h * 0.20 });
  return <>
    <CuboidSolid object={body} viewport={viewport} camera={camera} fill={skin.primary} selected={selected} />
    <CuboidSolid object={door} viewport={viewport} camera={camera} fill={skin.secondary} />
    <CuboidSolid object={handle} viewport={viewport} camera={camera} fill={skin.dark} />
    <AccentBand object={object} viewport={viewport} camera={camera} skin={skin} ratio={0.035} />
  </>;
}

export function EquipmentLowPoly({ object, equipment, skin, viewport, camera, selected = false }) {
  const subtype = object.subtype || equipment?.type_code || 'equipement';
  if (subtype === 'chaudiere') return <BoilerModel object={object} viewport={viewport} camera={camera} skin={skin} selected={selected} />;
  if (subtype === 'pompe') return <PumpModel object={object} viewport={viewport} camera={camera} skin={skin} selected={selected} />;
  if (subtype === 'adoucisseur') return <CylinderEquipment object={object} viewport={viewport} camera={camera} skin={skin} selected={selected} controller />;
  if (subtype === 'ballon' || subtype === 'vase_expansion' || subtype === 'bouteille') return <CylinderEquipment object={object} viewport={viewport} camera={camera} skin={skin} selected={selected} />;
  if (subtype === 'echangeur') return <ExchangerModel object={object} viewport={viewport} camera={camera} skin={skin} selected={selected} />;
  if (subtype === 'cta' || subtype === 'vmc' || subtype === 'ventilateur') return <AirBoxModel object={object} viewport={viewport} camera={camera} skin={skin} selected={selected} />;
  if (subtype === 'armoire') return <CabinetModel object={object} viewport={viewport} camera={camera} skin={skin} selected={selected} />;
  if (subtype === 'bac_sel') return <CuboidSolid object={object} viewport={viewport} camera={camera} fill={skin.primary} selected={selected} />;
  return <><CuboidSolid object={object} viewport={viewport} camera={camera} fill={skin.primary} selected={selected} /><AccentBand object={object} viewport={viewport} camera={camera} skin={skin} /></>;
}

export function MasonryBaseLowPoly({ object, viewport, camera }) {
  const support = object.params?.support;
  if (support?.type !== 'masonry') return null;
  const overhang = n(support.overhang, 0.05);
  const height = n(support.height, 0.10);
  const base = { ...object, z: n(object.z) - height, width: n(support.width, n(object.width) + overhang * 2), depth: n(support.depth, n(object.depth) + overhang * 2), height };
  return <CuboidSolid object={base} viewport={viewport} camera={camera} fill="#757A7D" opacity={0.82} />;
}

export function ArchitectureLowPoly({ object, viewport, camera, selected = false }) {
  if (object.subtype === 'floor') {
    return <CuboidSolid object={object} viewport={viewport} camera={camera} fill={LAB3D_RENDER_COLORS.floor} selected={selected} opacity={0.52} />;
  }
  if (object.subtype === 'wall') {
    return <CuboidSolid object={object} viewport={viewport} camera={camera} fill={LAB3D_RENDER_COLORS.wall} selected={selected} opacity={selected ? 0.62 : 0.34} />;
  }
  if (object.subtype === 'stair') {
    const steps = Math.max(3, Math.round(n(object.params?.steps, 8)));
    const parts = [];
    for (let i = 0; i < steps; i += 1) {
      const stepDepth = n(object.depth, 2) / steps;
      const stepHeight = n(object.height, 1.5) / steps;
      parts.push(partObject(object, {
        y: -n(object.depth, 2) / 2 + stepDepth * (i + 0.5),
        z: 0,
        width: n(object.width, 1),
        depth: stepDepth * 0.96,
        height: stepHeight * (i + 1),
      }));
    }
    return <>{parts.map((part, index) => <CuboidSolid key={index} object={part} viewport={viewport} camera={camera} fill="#7C858B" selected={selected && index === steps - 1} opacity={0.9} />)}</>;
  }
  return <CuboidSolid object={object} viewport={viewport} camera={camera} fill="#7C8B94" selected={selected} opacity={0.7} />;
}

export function OpeningLowPoly({ opening, wall, viewport, camera, selected = false }) {
  if (!wall) return null;
  const thickness = Math.max(0.03, Math.min(n(wall.width, 0.18), n(wall.depth, 0.18)) * 1.12);
  const kindColor = opening.kind === 'door' ? '#A66D47' : opening.kind === 'grille' ? '#8099A8' : '#6DA8C4';
  const thin = {
    x: n(opening.x), y: n(opening.y), z: n(opening.z),
    width: n(opening.width, 0.9), depth: thickness, height: n(opening.height, 2.05),
    rotation_deg: n(opening.rotation_deg),
  };
  return <CuboidSolid object={thin} viewport={viewport} camera={camera} fill={kindColor} selected={selected} opacity={opening.kind === 'door' ? 0.9 : 0.62} />;
}

export function SceneGrid3D({ viewport, camera, step = 0.25, size = 12 }) {
  const increment = Math.max(0.25, n(step, 0.25));
  const lines = [];
  let index = 0;
  for (let v = -size; v <= size + 0.001; v += increment) {
    const major = Math.abs(Math.round(v / increment)) % Math.max(1, Math.round(1 / increment)) === 0;
    const stroke = major ? LAB3D_RENDER_COLORS.gridMajor : LAB3D_RENDER_COLORS.gridMinor;
    const width = major ? 1.0 : 0.45;
    const a = project3d({ x: -size, y: v, z: 0 }, viewport, camera);
    const b = project3d({ x: size, y: v, z: 0 }, viewport, camera);
    const c = project3d({ x: v, y: -size, z: 0 }, viewport, camera);
    const d = project3d({ x: v, y: size, z: 0 }, viewport, camera);
    lines.push(<Line key={`gx-${index++}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={width} />);
    lines.push(<Line key={`gy-${index++}`} x1={c.x} y1={c.y} x2={d.x} y2={d.y} stroke={stroke} strokeWidth={width} />);
  }
  const origin = project3d({ x: 0, y: 0, z: 0 }, viewport, camera);
  const x = project3d({ x: 2, y: 0, z: 0 }, viewport, camera);
  const y = project3d({ x: 0, y: 2, z: 0 }, viewport, camera);
  const z = project3d({ x: 0, y: 0, z: 2 }, viewport, camera);
  return <>{lines}<Line x1={origin.x} y1={origin.y} x2={x.x} y2={x.y} stroke={LAB3D_RENDER_COLORS.axisX} strokeWidth={2} /><Line x1={origin.x} y1={origin.y} x2={y.x} y2={y.y} stroke={LAB3D_RENDER_COLORS.axisY} strokeWidth={2} /><Line x1={origin.x} y1={origin.y} x2={z.x} y2={z.y} stroke={LAB3D_RENDER_COLORS.axisZ} strokeWidth={2} /></>;
}

export function NetworkLowPoly({ network, viewport, camera, color = '#B6C8D0', selected = false }) {
  const points = network.points || [];
  const strokeWidth = clamp(2 + n(network.diameter_mm, 50) / 32, 2.5, 9);
  let arrow = null;
  let bestLength = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = project3d(points[i], viewport, camera); const b = project3d(points[i + 1], viewport, camera);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > bestLength) { bestLength = len; arrow = { a, b }; }
  }
  let arrowPolygon = null;
  if (arrow && bestLength > 18) {
    const dx = arrow.b.x - arrow.a.x; const dy = arrow.b.y - arrow.a.y; const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len; const uy = dy / len; const px = -uy; const py = ux;
    const mx = (arrow.a.x + arrow.b.x) / 2; const my = (arrow.a.y + arrow.b.y) / 2;
    arrowPolygon = `${mx + ux * 9},${my + uy * 9} ${mx - ux * 6 + px * 5},${my - uy * 6 + py * 5} ${mx - ux * 6 - px * 5},${my - uy * 6 - py * 5}`;
  }
  return <>
    {points.slice(0, -1).map((point, index) => {
      const a = project3d(point, viewport, camera); const b = project3d(points[index + 1], viewport, camera);
      return <Line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={selected ? strokeWidth + 2 : strokeWidth} strokeLinecap="round" opacity={selected ? 1 : 0.86} />;
    })}
    {arrowPolygon ? <Polygon points={arrowPolygon} fill={color} stroke={selected ? '#FFFFFF' : color} strokeWidth={selected ? 0.8 : 0} /> : null}
  </>;
}

export function ObjectLabel({ object, viewport, camera, selected = false, suffix = '' }) {
  const p = project3d({ x: object.x, y: object.y, z: n(object.z) + n(object.height, 1) + 0.16 }, viewport, camera);
  return <SvgText x={p.x} y={p.y} fill={selected ? LAB3D_RENDER_COLORS.cyan : '#DCEAF1'} fontSize="10.5" fontWeight="700" textAnchor="middle">{`${String(object.label || object.subtype || 'Objet').slice(0, 24)}${suffix}`}</SvgText>;
}

export function RemarkMarker({ object, index = 0, viewport, camera }) {
  const p = project3d({ x: n(object.x) + 0.20 + index * 0.12, y: n(object.y) - 0.18, z: n(object.z) + n(object.height, 1) + 0.48 + index * 0.14 }, viewport, camera);
  return <><Circle cx={p.x} cy={p.y} r={8} fill="#FF5D63" stroke="#FFF" strokeWidth={1.5} /><SvgText x={p.x} y={p.y + 3.5} fill="#FFF" fontSize="8" fontWeight="900" textAnchor="middle">!</SvgText></>;
}
