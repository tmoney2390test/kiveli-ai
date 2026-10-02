import { eosMajorIncidents } from './eos-meridian-major.mjs';
import { caldersMajorIncidents } from './calders-run-major.mjs';
import { northvaleMajorIncidents } from './northvale-major.mjs';
import { vervelleMajorIncidents } from './port-vervelle-major.mjs';
import { neonKyoMajorIncidents } from './neon-kyo-major.mjs';
import { vespormoorMajorIncidents } from './vespormoor-major.mjs';
import { vharadrenMajorIncidents } from './vharadren-major.mjs';
import { juniperMajorIncidents } from './juniper-city-major.mjs';
import { gildedCoastMajorIncidents } from './gilded-coast-major.mjs';

export const seedableMajorCatalogs = {
  'calders-run': caldersMajorIncidents,
  'eos-meridian': eosMajorIncidents,
  'gilded-coast': gildedCoastMajorIncidents,
  'juniper-city': juniperMajorIncidents,
  'neon-kyo': neonKyoMajorIncidents,
  northvale: northvaleMajorIncidents,
  'port-vervelle': vervelleMajorIncidents,
  vespormoor: vespormoorMajorIncidents,
  vharadren: vharadrenMajorIncidents,
};

export const allMajorCatalogs = seedableMajorCatalogs;
