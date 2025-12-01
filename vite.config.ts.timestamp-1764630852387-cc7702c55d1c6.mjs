// vite.config.ts
import { sveltekit } from "file:///E:/Desktop/Coding/dawduction/node_modules/@sveltejs/kit/src/exports/vite/index.js";
import { defineConfig } from "file:///E:/Desktop/Coding/dawduction/node_modules/vite/dist/node/index.js";
var vite_config_default = defineConfig({
  plugins: [sveltekit()],
  server: {
    fs: {
      allow: ["."]
    }
  },
  worker: {
    format: "es"
  },
  define: {
    // Polyfill Node.js globals for browser compatibility
    global: "globalThis",
    "process.env": "{}",
    // Polyfill __dirname and __filename for libflacjs
    "__dirname": '"/"',
    "__filename": '""'
  },
  optimizeDeps: {
    exclude: ["lamejs"]
    // Exclude from optimization - will be loaded dynamically
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJFOlxcXFxEZXNrdG9wXFxcXENvZGluZ1xcXFxkYXdkdWN0aW9uXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJFOlxcXFxEZXNrdG9wXFxcXENvZGluZ1xcXFxkYXdkdWN0aW9uXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9FOi9EZXNrdG9wL0NvZGluZy9kYXdkdWN0aW9uL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgc3ZlbHRla2l0IH0gZnJvbSAnQHN2ZWx0ZWpzL2tpdC92aXRlJztcclxuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG5cdHBsdWdpbnM6IFtzdmVsdGVraXQoKV0sXHJcblx0c2VydmVyOiB7XHJcblx0XHRmczoge1xyXG5cdFx0XHRhbGxvdzogWycuJ11cclxuXHRcdH1cclxuXHR9LFxyXG5cdHdvcmtlcjoge1xyXG5cdFx0Zm9ybWF0OiAnZXMnXHJcblx0fSxcclxuXHRkZWZpbmU6IHtcclxuXHRcdC8vIFBvbHlmaWxsIE5vZGUuanMgZ2xvYmFscyBmb3IgYnJvd3NlciBjb21wYXRpYmlsaXR5XHJcblx0XHRnbG9iYWw6ICdnbG9iYWxUaGlzJyxcclxuXHRcdCdwcm9jZXNzLmVudic6ICd7fScsXHJcblx0XHQvLyBQb2x5ZmlsbCBfX2Rpcm5hbWUgYW5kIF9fZmlsZW5hbWUgZm9yIGxpYmZsYWNqc1xyXG5cdFx0J19fZGlybmFtZSc6ICdcIi9cIicsXHJcblx0XHQnX19maWxlbmFtZSc6ICdcIlwiJ1xyXG5cdH0sXHJcblx0b3B0aW1pemVEZXBzOiB7XHJcblx0XHRleGNsdWRlOiBbJ2xhbWVqcyddIC8vIEV4Y2x1ZGUgZnJvbSBvcHRpbWl6YXRpb24gLSB3aWxsIGJlIGxvYWRlZCBkeW5hbWljYWxseVxyXG5cdH1cclxufSk7XHJcblxyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQThRLFNBQVMsaUJBQWlCO0FBQ3hTLFNBQVMsb0JBQW9CO0FBRTdCLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzNCLFNBQVMsQ0FBQyxVQUFVLENBQUM7QUFBQSxFQUNyQixRQUFRO0FBQUEsSUFDUCxJQUFJO0FBQUEsTUFDSCxPQUFPLENBQUMsR0FBRztBQUFBLElBQ1o7QUFBQSxFQUNEO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDUCxRQUFRO0FBQUEsRUFDVDtBQUFBLEVBQ0EsUUFBUTtBQUFBO0FBQUEsSUFFUCxRQUFRO0FBQUEsSUFDUixlQUFlO0FBQUE7QUFBQSxJQUVmLGFBQWE7QUFBQSxJQUNiLGNBQWM7QUFBQSxFQUNmO0FBQUEsRUFDQSxjQUFjO0FBQUEsSUFDYixTQUFTLENBQUMsUUFBUTtBQUFBO0FBQUEsRUFDbkI7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
