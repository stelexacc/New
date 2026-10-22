'use strict';
const path=require('node:path');
if(/stelex admin/i.test(path.basename(process.execPath)) || process.argv.includes('--admin'))require('./locked-admin.cjs');
else require('./main.cjs');
