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

import {useCallback} from 'react';
import {Button, Card, Dropdown, Space, Typography, Tooltip} from 'antd';
import {UnorderedListOutlined} from '@ant-design/icons';
import {Link, useNavigate} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import GraphView from '../../components/GraphinView';
import moment from 'moment';
import _ from 'lodash';
import {formatToGraphInData} from '../../utils/formatGraphInData';
import {isPdEnabled} from '../../utils/config';
import style from './index.module.scss';
import {byteConvert} from '../../utils/format';
import {getResourceDisplayName} from '../../utils/displayName';

const TitleField = ({item, onClick, onKeyDown, schemaTypeCounts}) => {
    const {t} = useTranslation();
    const pdMode = isPdEnabled();
    const graphName = getResourceDisplayName(item.name, item.nickname);
    const graphspaceName = item.graphspace === 'DEFAULT'
        ? t('graphspace.default_name')
        : getResourceDisplayName(item.graphspace, item.graphspace_nickname);
    const displayName = pdMode
        ? `${_.truncate(graphspaceName, {length: 12})}-${_.truncate(graphName, {length: 12})}`
        : graphName;
    const fullTitle = pdMode
        ? `${graphspaceName}-${graphName}`
        : graphName;
    const createdAt = item.create_time
        ? moment(item.create_time).format('YYYY-MM-DD')
        : '--';

    return (
        <>
            <Typography.Text
                style={{maxWidth: 244}}
                ellipsis={{ellipsis: true}}
                title={fullTitle}
                onClick={onClick}
                onKeyDown={onKeyDown}
                role='button'
                tabIndex={0}
            >
                {displayName}
            </Typography.Text>
            {item.default && <span className={style.default}>{t('common.label.default')}</span>}
            <div className={style.subtitle}>
                {t('graph.card.storage')}: {item.storage >= 0 ? byteConvert(item.storage) : '--'}
                {' / '}
                {t('graph.col.create_time')}: {createdAt}
                {' / '}
                {t('graph.card.schema_types', schemaTypeCounts)}
            </div>
        </>
    );
};

const GraphCard = ({item, menus}) => {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const graphName = getResourceDisplayName(item.name, item.nickname);
    const schemaView = item.schemaview || {vertices: [], edges: []};
    const graphinData = formatToGraphInData(schemaView, true);
    const schemaIsEmpty = graphinData.nodes.length === 0 && graphinData.edges.length === 0;
    const hasElementCounts = item.statistic
        && item.statistic.vertex !== null
        && item.statistic.vertex !== undefined
        && item.statistic.edge !== null
        && item.statistic.edge !== undefined
        && Number.isFinite(Number(item.statistic.vertex))
        && Number.isFinite(Number(item.statistic.edge));
    const graphspace = item.graphspace || 'DEFAULT';
    const overviewPath = `/graphspace/${graphspace}/graph/${item.name}/detail`;
    const schemaPath = `/graphspace/${graphspace}/graph/${item.name}/meta`;

    const handleGotoAnalysis = useCallback(() => {
        navigate(`/gremlin/${item.graphspace || 'DEFAULT'}/${item.name}`);
    }, [item, navigate]);

    const handleGotoSchema = useCallback(() => {
        navigate(schemaPath);
    }, [navigate, schemaPath]);

    const handleSchemaKeyDown = useCallback(event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleGotoSchema();
        }
    }, [handleGotoSchema]);

    return (
        <Card
            className={style.card}
            title={(
                <TitleField
                    item={item}
                    onClick={handleGotoSchema}
                    onKeyDown={handleSchemaKeyDown}
                    schemaTypeCounts={{
                        vertices: schemaView.vertices?.length || 0,
                        edges: schemaView.edges?.length || 0,
                    }}
                />
            )}
            headStyle={{
                paddingLeft: 20,
            }}
            extra={(
                <Dropdown
                    menu={{items: menus}}
                    trigger={['click']}
                >
                    <Button
                        type='text'
                        icon={<UnorderedListOutlined />}
                        aria-label={t('graph.card.more_actions', {graph: graphName})}
                    />
                </Dropdown>
            )}
            actions={[
                hasElementCounts && (
                    <Tooltip key='counts' title={t('graph.card.counts_tooltip')}>
                        <span className={style.element_counts}>
                            {t('graph.card.element_counts', {
                                vertices: item.statistic.vertex,
                                edges: item.statistic.edge,
                            })}
                        </span>
                    </Tooltip>
                ),
                <Link key='overview' to={overviewPath}>{t('graph.card.overview')}</Link>,
                <Link key='query' to={`/gremlin/${graphspace}/${item.name}`}>
                    {t('graph.card.query_graph')}
                </Link>,
            ].filter(Boolean)}
        >
            {schemaIsEmpty ? (
                <div className={style.empty_schema}>
                    <strong>{t('graph.card.empty_schema')}</strong>
                    <span>{t('graph.card.empty_schema_help')}</span>
                    <Space>
                        <Button type='primary' size='small' onClick={handleGotoSchema}>
                            {t('graph.card.open_schema')}
                        </Button>
                        <Button size='small' onClick={handleGotoAnalysis}>
                            {t('graph.card.query_graph')}
                        </Button>
                    </Space>
                </div>
            ) : (
                <div
                    className={style.card_content}
                    onClick={handleGotoSchema}
                    onKeyDown={handleSchemaKeyDown}
                    role='button'
                    tabIndex={0}
                >
                    <GraphView
                        data={graphinData}
                        style={{minHeight: '153px'}}
                        layout={{
                            type: 'gForce',
                            // center: [200, 200],
                            linkDistance: 100,
                            coulombDisScale: 0.01,
                        // preventOverlap: true,
                        // begin: item.schemaview.vertices.length > 1
                        //     ? [0, 0] : [200, 100],
                        }}
                        height={147}
                        config={{
                        // minZoom: 0.6,
                        // maxZoom: 0.6,
                            fitView: false,
                            fitCenter: true,
                        // handleZoomIn: false,
                        }}
                        behaviors={{
                            zoomCanvas: {disabled: true},
                            dragNode: {disabled: true},
                            dragCanvas: {disabled: true},
                            clickSelect: {disabled: true},
                            hoverable: {disabled: true},
                        }}
                    />
                </div>
            )}
        </Card>
    );
};

export default GraphCard;
