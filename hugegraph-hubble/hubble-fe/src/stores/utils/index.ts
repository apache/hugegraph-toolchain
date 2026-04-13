/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

import { isUndefined, size } from 'lodash-es';
import isInt from 'validator/lib/isInt';
import isFloat from 'validator/lib/isFloat';
import isBoolean from 'validator/lib/isBoolean';
import isISO8601 from 'validator/lib/isISO8601';
import isUUID from 'validator/lib/isUUID';
import isEmpty from 'validator/lib/isEmpty';
import i18next from '../../i18n';

import type vis from 'vis-network';
import type {
  GraphNode,
  GraphEdge
} from '../types/GraphManagementStore/dataAnalyzeStore';
import type {
  VertexTypeProperty,
  MetadataProperty
} from '../types/GraphManagementStore/metadataConfigsStore';

/* variables */

export const vertexRadiusMapping: Record<string, number> = {
  HUGE: 40,
  BIG: 30,
  NORMAL: 20,
  SMALL: 10,
  TINY: 1
};

export const edgeWidthMapping: Record<string, number> = {
  THICK: 45,
  NORMAL: 20,
  FINE: -10
};

/* functions */

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error
  ) {
    const errorWithMessage = error as { message?: unknown };

    if (typeof errorWithMessage.message === 'string') {
      return errorWithMessage.message;
    }
  }

  return String(error);
}

export function checkIfLocalNetworkOffline(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'request' in error
  ) {
    const errorWithRequest = error as { request?: unknown };

    if (!isUndefined(errorWithRequest.request)) {
      throw new Error(i18next.t('addition.store.network-error'));
    }
  }

  throw error;
}

export function mapMetadataProperties(
  properties: VertexTypeProperty[],
  propertyCollection: MetadataProperty[]
) {
  const mappedProperties: Record<string, string> = {};

  properties.forEach(({ name }) => {
    const value = propertyCollection.find(
      ({ name: propertyName }) => propertyName === name
    )!.data_type;

    mappedProperties[name] = value;
  });

  return mappedProperties;
}

export function generateGraphModeId(
  id: string,
  source: string,
  target: string
): string {
  return `${source}-${id}->${target}`;
}

export function convertArrayToString(
  values: any[] | any,
  separtor: string = ','
) {
  return Array.isArray(values)
    ? values.filter((value) => value !== '').join(separtor)
    : String(values);
}

export function validateGraphProperty(
  type: string,
  value: string,
  premitEmpty: boolean = false
) {
  if (premitEmpty) {
    if (value === '') {
      return true;
    }
  }

  switch (type) {
    case 'BOOLEAN':
      return isBoolean(value);
    case 'BYTE':
      return isInt(value) && Number(value) > -128 && Number(value) <= 127;
    case 'INT':
    case 'LONG':
      return isInt(value);
    case 'FLOAT':
    case 'DOUBLE':
      return isFloat(value);
    case 'TEXT':
    case 'BLOB':
      return !isEmpty(value);
    case 'DATE':
      return isISO8601(value);
    case 'UUID':
      return isUUID(value);
  }
}

export function addGraphNodes(
  collection: GraphNode[],
  visGraphNodes: vis.data.DataSet<GraphNode>,
  vertexSizeMapping: Record<string, string>,
  colorMappings: Record<string, string>,
  displayFieldMappings: Record<string, string[]>
) {
  collection.forEach(({ id, label, properties }) => {
    const joinedLabel = !isUndefined(displayFieldMappings[label])
      ? displayFieldMappings[label]
          .map((field) => (field === '~id' ? id : properties[field]))
          .filter((label) => label !== undefined && label !== null)
          .join('-')
      : id;

    visGraphNodes.add({
      id,
      label:
        size(joinedLabel) <= 15
          ? joinedLabel
          : joinedLabel.slice(0, 15) + '...',
      vLabel: label,
      value: vertexRadiusMapping[vertexSizeMapping[label]],
      font: { size: 16 },
      properties,
      title: `
            <div class="tooltip-fields">
              <div>${i18next.t('addition.common.vertex-type')}：</div>
              <div>${label}</div>
            </div>
            <div class="tooltip-fields">
              <div>${i18next.t('addition.common.vertex-id')}：</div>
              <div>${id}</div>
            </div>
            ${Object.entries(properties)
              .map(([key, value]) => {
                return `<div class="tooltip-fields">
                          <div>${key}: </div>
                          <div>${convertArrayToString(value)}</div>
                        </div>`;
              })
              .join('')}
          `,
      color: {
        background: colorMappings[label] || '#5c73e6',
        border: colorMappings[label] || '#5c73e6',
        highlight: { background: '#fb6a02', border: '#fb6a02' },
        hover: { background: '#ec3112', border: '#ec3112' }
      },
      // reveal label when zoom to max
      scaling: {
        label: {
          max: Infinity,
          maxVisible: Infinity
        }
      },
      chosen: {
        node(values: any, id: string, selected: boolean, hovering: boolean) {
          if (hovering || selected) {
            values.shadow = true;
            values.shadowColor = 'rgba(0, 0, 0, 0.6)';
            values.shadowX = 0;
            values.shadowY = 0;
            values.shadowSize = 25;
          }

          if (selected) {
            values.size += 5;
          }
        }
      }
    });
  });
}

export function addGraphEdges(
  collection: GraphEdge[],
  visGraphEdges: vis.data.DataSet<GraphEdge>,
  colorMappings: Record<string, string>,
  edgeThicknessMappings: Record<string, string>,
  edgeWithArrowMappings: Record<string, boolean>,
  displayFieldMappings: Record<string, string[]>
) {
  collection.forEach(({ id, label, source, target, properties }) => {
    const joinedLabel = displayFieldMappings[label]
      .map((field) => (field === '~id' ? label : properties[field]))
      .join('-');

    visGraphEdges.add({
      id,
      label:
        joinedLabel.length <= 15
          ? joinedLabel
          : joinedLabel.slice(0, 15) + '...',
      properties,
      source,
      target,
      from: source,
      to: target,
      font: { size: 16, strokeWidth: 0, color: '#666' },
      arrows: edgeWithArrowMappings[label] ? 'to' : '',
      color: colorMappings[label],
      value: edgeWidthMapping[edgeThicknessMappings[label]],
      title: `
            <div class="tooltip-fields">
              <div>${i18next.t('addition.common.edge-type')}：</div>
            <div>${label}</div>
            </div>
            <div class="tooltip-fields">
              <div>${i18next.t('addition.common.edge-id')}：</div>
              <div>${id}</div>
            </div>
            ${Object.entries(properties)
              .map(([key, value]) => {
                return `<div class="tooltip-fields">
                            <div>${key}: </div>
                            <div>${convertArrayToString(value)}</div>
                          </div>`;
              })
              .join('')}
          `
    });
  });
}

export function formatVertexIdText(
  text: string,
  replacedText: string,
  revert: boolean = false
) {
  if (!revert) {
    return text === '~id' ? replacedText : text;
  } else {
    return text === replacedText ? '~id' : text;
  }
}

export function isGtNegativeOneButZero(value: string | number) {
  if (typeof value === 'number') {
    value = String(value);
  }

  return !(
    !isEmpty(value) &&
    (!isInt(value as string, { min: -1 }) || String(Number(value)) === '0')
  );
}
