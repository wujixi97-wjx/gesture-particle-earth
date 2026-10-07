import './style.css'
import { Experience } from './core/Experience'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('Application root missing')
const experience = new Experience(root)
void experience.start()
window.addEventListener('pagehide', () => experience.dispose(), { once: true })
