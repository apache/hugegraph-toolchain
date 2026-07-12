/*
 *
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

import {Utils} from '@antv/graphin';
import icons from './graph';
import {iconsMap} from './constants';

/**
 * huge格式转为graphin格式
 * edge: {
        "id": "person-knows->person",
        "label": "knows",
        "source": "person",
        "target": "person",
        "sort_keys": [],
        "properties": {
            "date": "date",
            "weight": "double"
        },
        "~style": {
            "color": "#5C73E6",
            "with_arrow": true,
            "line_type": "SOLID",
            "thickness": "NORMAL",
            "display_fields": [
                "~id"
            ],
            "join_symbols": [
                "-"
            ]
        }
    }

    "node": {
        "id": "software",
        "label": "software",
        "primary_keys": [
            "name"
        ],
        "properties": {
            "price": "int",
            "lang": "text",
            "name": "text"
        },
        "~style": {
            "icon": "",
            "color": "#5C73E6",
            "size": "NORMAL",
            "display_fields": [
                "~id"
            ],
            "join_symbols": [
                "-"
            ]
        }
    }
 * @param {object} hugeData
 * @returns
 */
const formatToGraphInData = (hugeData, showLabel = true) => {

    const nodes = [];
    const edges = [];

    for (let item of hugeData.vertices) {
        const color = item['~style']?.color ?? '#eee';
        const icon = item['~style']?.icon ?? '';
        nodes.push({
            id: item.id,
            // label: item.label,
            style: {
                label: {
                    value: showLabel ? item.label : '',
                },
                keyshape: {
                    fill: color,
                    // stroke: increase_brightness(color, 10),
                    stroke: color,
                },
                icon: {
                    show: true,
                    text: icons[iconsMap[icon]],
                    fontFamily: 'graphin',
                    fontSize: 12,
                    _iconName: icon,
                },
            },
            data: {...item,
                properties: {...item.properties},
                '~style': {...item['~style']},
            },
        });
    }

    const polyEdges = Utils.processEdges(hugeData.edges, {poly: 50, loop: 10});

    for (let item of polyEdges) {
        const color = item['~style']?.color ?? '#eee';
        // const endArrow = item['~style'].with_arrow ? {path: 'M 0,0 L 8,4 L 8,-4 Z', fill: color} : false;
        const endArrow = item['~style'].with_arrow ? undefined : false;

        edges.push({
            source: item.source,
            target: item.target,
            // status: {
            //     selected: true,
            // },
            // label: item.label,
            style: {
                ...item.style,
                label: {
                    value: showLabel ? item.label : '',
                    fill: '#000',
                },
                keyshape: {
                    ...item?.style?.keyshape,
                    stroke: color,
                    endArrow,
                },
            },
            data: {...item,
                properties: {...item.properties},
                '~style': {...item['~style']},
            },
        });
    }

    return {nodes, edges};
};

export {formatToGraphInData};
