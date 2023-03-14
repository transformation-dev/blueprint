import { TreeBase } from './tree-base.js'

export class Tree extends TreeBase {
  static rootNodeType = 'root-org-tree-node'

  static rootNodeVersion = 'v1'

  static nodeType = 'org-tree-node'

  static nodeVersion = 'v1'

  static doNameString = 'DO_API'
}
