dash.calc('researchStats', {
  title: 'Research-ul din 26.11 (rundele 2 și 3), numărat',
  description: 'Câte constatări are fiecare unghi și cât de verificate sunt.',
  inputs: ['research'],
  fn: (research) => {
    const out = [];
    const add = (grup, id, eticheta, n) => out.push({grup, id, eticheta, n});
    const unghiuri = [...new Set(research.map((r) => r.unghi))];
    unghiuri.forEach((u, i) => add('unghi', 'u-' + i, u, research.filter((r) => r.unghi === u).length));
    add('verificare', 'v-total', 'constatări în total', research.length);
    add('verificare', 'v-deschis', 'deschise de agentul care le-a găsit', research.filter((r) => r.deschis === 'da').length);
    add('verificare', 'v-conf', 'redeschise independent și confirmate', research.filter((r) => r.verificare === 'confirmat').length);
    add('verificare', 'v-part', 'redeschise independent, confirmate în parte', research.filter((r) => /în parte/.test(r.verificare)).length);
    add('verificare', 'v-chrome', 'citite direct de Claude, în Chrome', research.filter((r) => /Chrome/.test(r.verificare)).length);
    return out;
  }
});
