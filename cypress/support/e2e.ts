import './commands';

beforeEach(function () {
  const filter = Cypress.env('caseType');
  if (filter && filter !== 'all' && this.currentTest) {
    const marker = `[${String(filter).toLowerCase()}]`;
    if (!this.currentTest.title.toLowerCase().includes(marker)) {
      this.skip();
    }
  }
});
