import { mount } from 'svelte'
import 'autocompleter/autocomplete.css'
import './app.css'
import App from './App.svelte'

const target = document.getElementById('app')

if (!target) {
  throw new Error('Missing #app element')
}

const app = mount(App, { target, props: {} })

export default app
