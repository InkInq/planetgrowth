// Redraws every part of the screen from `state`. Call it after anything changes the world.
import { renderHeader, renderSystems } from './systems.js';
import { renderTasks } from './tasks.js';
import { renderGoals } from './goals.js';
import { renderCalendar } from './calendar.js';
import { renderHistory } from './history.js';
import { syncNodes } from './world.js';
import { checkTutorial, renderFirstSteps } from './tutorial.js';

export function renderAll() {
  renderHeader();
  renderTasks();
  renderGoals();
  renderSystems();
  renderCalendar();
  renderHistory();
  syncNodes();
  checkTutorial();
  renderFirstSteps();
}
