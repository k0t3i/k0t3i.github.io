<template>
  <div id="app">
    <div id="nav">
      <router-link to="/">Home</router-link> |
      <router-link to="/experience">experience</router-link> |
      <router-link to="/skills">skills</router-link> |
      <router-link to="/expertises">expertises</router-link> |

      <router-link to="/about">About</router-link>
    </div>
    <router-view />
  </div>
</template>

<style lang="scss">
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: $blacksmooth; //$primary;

  width: 100vw;
  height: 100vh;
  position: relative;
  background-color: $ghostwhite;
}

@media (orientation: portrait) {
  #app {
  }
}
</style>
