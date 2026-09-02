import React from 'react';
import { EquipmentLowPoly as ProceduralEquipmentLowPoly } from './Lab3DRendererBase.js';
import { ManufacturerEquipmentMesh } from './manufacturerModels/ManufacturerEquipmentMesh.js';
import { resolveManufacturerModel } from './manufacturerModels/library.js';

export * from './Lab3DRendererBase.js';

export function EquipmentLowPoly(props) {
  const manufacturerModel = resolveManufacturerModel(props.equipment, props.object);
  if (manufacturerModel) return <ManufacturerEquipmentMesh {...props} model={manufacturerModel} />;
  return <ProceduralEquipmentLowPoly {...props} />;
}
