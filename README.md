# Figma Plugin: Component and Instance Analyzer

This Figma plugin is designed to analyze your Figma document by scanning instance nodes on the current page or within selected layers. It processes each instance to retrieve detailed component information and generates preview images for both independent components and component sets with variants.

---

## How It Works

1. **Plugin UI Initialization:**  
   When the plugin starts, it displays a UI panel with options to scan either the current page or selected layers.  
   The UI is built using an HTML file and styled to match Figma's theme.

2. **Scanning and Processing Instances:**  
   - The plugin scans for instance nodes in the current page or within selected nodes.
   - For each instance:
     - It retrieves the main component.
     - Determines if the instance is nested.
     - Collects additional data such as component IDs, names, and types.
     - If part of a component set, it gathers all related variant information.

3. **Preview Image Generation:**  
   - The plugin exports a PNG image for each component node.
   - Images are scaled based on the width and height of the node, ensuring they fit within predefined limits.

4. **Restructuring and Analyzing Components:**  
   - After processing, instances are grouped by their component or component set.
   - For component sets, each variant is listed along with its instance count.
   - All nested statuses are verified to provide clarity on component usage.

5. **Interactivity and Figma Integration:**  
   - The structured data is sent to the UI to display a list of components along with preview images and instance counts.
   - Users can click on a component to view its instances.
   - Options to select a single instance or all instances are provided, and they automatically trigger viewport adjustments in Figma.

---

## Additional Information

- **Figma Plugin API:**  
  This plugin is built on Figma's Plugin API, ensuring smooth integration with your Figma documents.

- **Helpful Resources:**  
  - [Figma Plugin Documentation](https://www.figma.com/plugin-docs/plugin-quickstart-guide/)
  - [TypeScript Official Website](https://www.typescriptlang.org/)
