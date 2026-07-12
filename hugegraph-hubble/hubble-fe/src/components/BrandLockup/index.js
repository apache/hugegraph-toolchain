/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 */

import PropTypes from 'prop-types';
import Mark from '../../assets/hugegraph-mark.svg';
import style from './index.module.scss';

const BrandLockup = ({className = '', compact = false}) => (
    <span className={`${style.lockup} ${compact ? style.compact : ''} ${className}`}>
        <img src={Mark} alt='Apache HugeGraph' />
        <span className={style.wordmark} aria-hidden='true'>HugeGraph</span>
    </span>
);

BrandLockup.propTypes = {
    className: PropTypes.string,
    compact: PropTypes.bool,
};

export default BrandLockup;
