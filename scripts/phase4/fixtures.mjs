import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function writeValidComponentProject(root) {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'labels.vx'), `#script
  export const label: String = "Industrial VX"
#end script
`, 'utf8');

  await writeFile(join(root, 'Card.vx'), `#script
  prop title: String
  output select: String
  content default: optional
  content footer: optional
  part root: container
  part title: text

  action choose() {
    emit("select", title)
  }
#end script

#view
  View @card @part(name: root) {
    Title(title) @part(name: title)
    Content(default)
    Button("Select") @primary {
      click => choose()
    }
    Content(footer)
  }
#end view
`, 'utf8');

  await writeFile(join(root, 'App.vx'), `#script
  import Card from "./Card.vx"
  import { label } from "./labels.vx"
  state selected: String = ""

  action receive(value: String) {
    selected = value
  }
#end script

#view
  View @page {
    Card {
      title: label
      select => receive($event)
      part title @title

      content default {
        Text("Projected content")
      }

      content footer {
        Text("Selected: " + selected)
      }
    }
  }
#end view
`, 'utf8');
}

export async function writeProject(root, files) {
  await mkdir(root, { recursive: true });
  for (const [name, source] of Object.entries(files)) {
    const path = join(root, name);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, source, 'utf8');
  }
}
