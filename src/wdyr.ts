'use client';

import React from 'react';

if (process.env.NODE_ENV === 'development') {
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const whyDidYouRender = require('@welldone-software/why-did-you-render');
    whyDidYouRender(React, {
      trackAllPureComponents: true,
    });
  }
}
