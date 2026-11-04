<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { onBeforeUnmount, onMounted } from 'vue';
import { en } from '../content/en';
import { fr } from '../content/fr';
import { rememberLang } from '../lib/langRedirect';

/*
 * The page of an address that leads nowhere: an open circuit. It has no language of its own, so it
 * speaks both, French first (the page is lang="fr", App.vue), English marked as such. Never indexed,
 * and no link preview: it is nobody's address. A link back is a choice of language, remembered as
 * the language links of the board remember it (without JavaScript, "/" does not redirect anyway).
 */
useHead({ title: fr.notFound.title, meta: [{ name: 'robots', content: 'noindex' }] });

/*
 * Leaving this page is a plain page change: the view transition between pages (motion.css) is
 * skipped on the way out. A crossfade from an address that leads nowhere adds nothing, and in WebKit
 * (iPhone emulation) that transition, after a tap on a link of this page, crashes the page.
 */
const skipTransition = (event: Event & { viewTransition?: ViewTransition | null }): void => event.viewTransition?.skipTransition();
onMounted(() => addEventListener('pageswap', skipTransition));
onBeforeUnmount(() => removeEventListener('pageswap', skipTransition));
</script>

<template>
  <!--
    On a board, as the home page: silkscreen on the mask stays readable on both pages, light or black.
    One face, flat, its edge drawn by its own shadow (depth.css): this board never turns.
  -->
  <div class="board board--open">
    <div class="board__body">
      <div class="board__face board__face--front">
        <header class="open__header">
          <p class="board__name">
            {{ fr.header.name }}
          </p>
          <p class="board__rev">
            {{ fr.header.rev }}
          </p>
        </header>
        <main class="open">
          <h1 class="open__title">
            {{ fr.notFound.title }} <span
              class="open__en"
              lang="en"
            >· {{ en.notFound.title }}</span>
          </h1>
          <!--
            The cut trace, static: from a pad, under the mask, to its end laid bare by the cut (its
            face along the cut), a gap, the slash of the blade down to the FR4 core, then the other
            end and the rest of the trace, to the other pad. In symbol units (1/16 rem at full size).
          -->
          <svg
            class="open__trace"
            viewBox="0 0 400 52"
            aria-hidden="true"
            focusable="false"
          >
            <path
              class="open__copper"
              d="M20 34H120L136 18H170M216 18H264L280 34H380"
            />
            <path
              class="open__bare"
              d="M168 16H186L184.7 20H168ZM201.3 16H218V20H200Z"
            />
            <path
              class="open__scratch"
              d="M196 6L188 30"
            />
            <g class="open__pads">
              <circle
                cx="20"
                cy="34"
                r="9"
              />
              <circle
                cx="380"
                cy="34"
                r="9"
              />
            </g>
            <g class="open__drills">
              <circle
                cx="20"
                cy="34"
                r="3.5"
              />
              <circle
                cx="380"
                cy="34"
                r="3.5"
              />
            </g>
          </svg>
          <div class="open__langs">
            <div class="open__lang">
              <p class="open__text">
                {{ fr.notFound.text }}
              </p>
              <a
                class="open__back"
                href="/"
                @click="rememberLang('fr')"
              >{{ fr.notFound.back }}</a>
            </div>
            <div class="open__lang">
              <p
                class="open__text"
                lang="en"
              >
                {{ en.notFound.text }}
              </p>
              <a
                class="open__back"
                href="/en/"
                hreflang="en"
                lang="en"
                @click="rememberLang('en')"
              >{{ en.notFound.back }}</a>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>
