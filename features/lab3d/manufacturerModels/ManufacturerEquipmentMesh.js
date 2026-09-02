import React, { useMemo } from 'react';
import { Circle, Path, Text as SvgText } from 'react-native-svg';
import { cameraPoint3d, project3d } from '../Lab3DRendererBase.js';

const n = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const deg = (value) => n(value) * Math.PI / 180;

function rotateXY(x, y, rotationDeg) {
  const r = deg(rotationDeg);
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
}

function worldVertex(local, object) {
  const p = rotateXY(local.x, local.y, object.rotation_deg);
  return { x: n(object.x) + p.x, y: n(object.y) + p.y, z: n(object.z) + local.z };
}

function worldNormal(normal, object) {
  const p = rotateXY(normal[0], normal[1], object.rotation_deg);
  return [p.x, p.y, normal[2]];
}

function tint(hex, factor) {
  const raw = String(hex || '#7891A2').replace('#', '');
  if (raw.length !== 6) return hex || '#7891A2';
  const value = parseInt(raw, 16);
  const r = Math.max(0, Math.min(255, Math.round(((value >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((value >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((value & 255) * factor)));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function groupColor(part, skin) {
  if (part === 'motor') return skin?.primary || '#57A55A';
  if (part === 'control') return skin?.dark || '#222B29';
  return skin?.secondary || '#3B4744';
}

function makeFacePath(group, vertices, object, viewport, camera) {
  let d = '';
  let depth = 0;
  let count = 0;
  for (let i = 0; i < group.triangles.length; i += 3) {
    const a3 = worldVertex(vertices[group.triangles[i]], object);
    const b3 = worldVertex(vertices[group.triangles[i + 1]], object);
    const c3 = worldVertex(vertices[group.triangles[i + 2]], object);
    const a = project3d(a3, viewport, camera);
    const b = project3d(b3, viewport, camera);
    const c = project3d(c3, viewport, camera);
    d += `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}L${c.x.toFixed(1)} ${c.y.toFixed(1)}Z`;
    depth += cameraPoint3d(a3, viewport, camera).depth + cameraPoint3d(b3, viewport, camera).depth + cameraPoint3d(c3, viewport, camera).depth;
    count += 3;
  }
  const normal = worldNormal(group.normal, object);
  const light = [0.35, -0.45, 0.82];
  const dot = Math.max(-1, Math.min(1, normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2]));
  const shade = 0.70 + Math.max(0, dot) * 0.28;
  return { d, depth: count ? depth / count : 0, shade };
}

export function ManufacturerEquipmentMesh({ object, skin, viewport, camera, selected = false, model }) {
  const faces = useMemo(() => model.mesh.groups.map((group, index) => ({
    index,
    group,
    ...makeFacePath(group, model.mesh.vertices, object, viewport, camera),
  })).sort((a, b) => a.depth - b.depth), [model, object.x, object.y, object.z, object.rotation_deg, viewport.width, viewport.height, camera]);

  return <>
    {faces.map(({ index, group, d, shade }) => <Path
      key={`${model.key}-${index}`}
      d={d}
      fill={tint(groupColor(group.part, skin), shade)}
      stroke={selected ? '#86E6FF' : 'none'}
      strokeWidth={selected ? 0.18 : 0}
      strokeLinejoin="round"
    />)}
    {selected ? model.ports.map((port) => {
      const local = rotateXY(port.position.x, port.position.y, object.rotation_deg);
      const p = project3d({ x: n(object.x) + local.x, y: n(object.y) + local.y, z: n(object.z) + port.position.z }, viewport, camera);
      return <React.Fragment key={port.name}><Circle cx={p.x} cy={p.y} r={5.5} fill="#5DD8FF" stroke="#FFFFFF" strokeWidth={1.1} /><SvgText x={p.x} y={p.y - 8} fill="#DFF8FF" fontSize="7.5" fontWeight="900" textAnchor="middle">{port.name === 'PORT_INLET' ? 'IN' : 'OUT'}</SvgText></React.Fragment>;
    }) : null}
  </>;
}
