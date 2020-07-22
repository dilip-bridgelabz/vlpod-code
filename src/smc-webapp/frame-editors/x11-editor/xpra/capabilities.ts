/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * CoCalc's Xpra HTML Client
 *
 * ---
 *
 * Xpra
 * Copyright (c) 2013-2017 Antoine Martin <antoine@devloop.org.uk>
 * Copyright (c) 2016 David Brushinski <dbrushinski@spikes.com>
 * Copyright (c) 2014 Joshua Higgins <josh@kxes.net>
 * Copyright (c) 2015-2016 Spikes, Inc.
 * Copyright (c) 2018-2019 SageMath, Inc.
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 */
/**
 * CoCalc Xpra HTML Client
 */

import * as forge from "node-forge";
import { CHARCODE_TO_NAME } from "./constants";
import { supportsWebp, calculateColorGamut, calculateScreens } from "./util";

const platformMap = {
  Win: {
    type: "win32",
    name: "Microsoft Windows",
  },
  Mac: {
    type: "darwin",
    name: "Mac OSX",
  },
  Linux: {
    type: "linux",
    name: "Linux",
  },
  X11: {
    type: "posix",
    name: "Posix",
  },
};

function getPlatform(): {
  type: string;
  name: string;
  processor: string;
  platform: string;
} {
  const { appVersion, oscpu, cpuClass } = navigator as any;
  const found = Object.keys(platformMap).find((k) => appVersion.includes(k));

  return Object.assign(
    {
      type: "unknown",
      name: "unknown",
      processor: oscpu || cpuClass || "unknown", // unlikely to work with modern browsers
      platform: appVersion,
    },
    found ? platformMap[found] : {}
  );
}

function getBrowser(): { name: string; agent: string } {
  return {
    name: "Chrome", // TODO
    agent: navigator.userAgent,
  };
}

function getEncodingCapabilities(config, soundCodecs) {
  const digest = [
    "hmac",
    "hmac+md5",
    "xor",
    ...Object.keys(forge.md.algorithms).map((hash) => `hmac+${hash}`),
  ];

  const detectedEncodings = ["jpeg", "png", "rgb", "rgb32"]; // "h264", "vp8+webm", "h264+mp4", "mpeg4+mp4"
  if (supportsWebp()) {
    detectedEncodings.push("webp");
  }

  const imageEncodings =
    config.image_codecs.length > 0 ? config.image_codecs : detectedEncodings;

  const audioEncodings =
    config.audio_codecs.length > 0 ? config.audio_codecs : soundCodecs;

  return {
    digest: digest,
    "salt-digest": digest,
    "generic-rgb-encodings": true,
    "sound.decoders": audioEncodings,
    encodings: imageEncodings,
    "encoding.generic": true,
    "encoding.rgb24zlib": true,
    "encoding.rgb_zlib": true,
    "encoding.icons.max_size": [30, 30],
    "encodings.core": imageEncodings,
    "encodings.rgb_formats": ["RGBX", "RGBA"],
    "encodings.window-icon": ["png"],
    "encodings.cursor": ["png"],
    "encoding.flush": true,
    "encoding.transparency": true,
    "encoding.client_options": true,
    "encoding.csc_atoms": true,
    "encoding.scrolling": true,
    "encoding.color-gamut": calculateColorGamut(),
    "encoding.video_scaling": true,
    "encoding.video_max_size": [1024, 768],
    "encoding.eos": true,
    "encoding.full_csc_modes": {
      mpeg1: ["YUV420P"],
      h264: ["YUV420P"],
      "mpeg4+mp4": ["YUV420P"],
      "h264+mp4": ["YUV420P"],
      "vp8+webm": ["YUV420P"],
      webp: ["BGRX", "BGRA"],
    },
    "encoding.h264.YUV420P.profile": "baseline",
    "encoding.h264.YUV420P.level": "2.1",
    "encoding.h264.cabac": false,
    "encoding.h264.deblocking-filter": false,
    "encoding.h264.fast-decode": true,
    "encoding.h264+mp4.YUV420P.profile": "main",
    "encoding.h264+mp4.YUV420P.level": "3.0",

    // prefer native video in mp4/webm container to broadway plain h264:
    "encoding.h264.score-delta": -20,
    "encoding.h264+mp4.score-delta": 50,
    "encoding.mpeg4+mp4.score-delta": 50,
    "encoding.vp8+webm.score-delta": 50,

    // 'encoding.scrolling.min-percent' : 30,
    // 'encoding.min-speed': 80,
    // 'encoding.min-quality': 50,
    // 'encoding.non-scroll': ['rgb32', 'png', 'jpeg'],
  };
}

function getClientCapabilities(config) {
  const keycodes = Object.keys(CHARCODE_TO_NAME).reduce(
    (result, c) => [
      ...result,
      [parseInt(c, 10), CHARCODE_TO_NAME[c], parseInt(c, 10), 0, 0],
    ],
    []
  );

  return {
    share: config.share,
    steal: config.steal,
    windows: true,
    "file-transfer": config.transfer,
    printing: config.printing,
    "file-size-limit": 10,
    auto_refresh_delay: 500,
    randr_notify: true,
    raw_window_icons: true,
    cursors: true,
    bell: config.bell,
    system_tray: true,
    "server-window-resize": true,
    named_cursors: false, // NOTE: we cannot handle this (GTK only)
    "notify-startup-complete": true,

    // Windows
    "window.raise": true,
    "window.initiate-moveresize": true,

    "metadata.supported": [
      //"fullscreen",
      //"maximized",
      "above",
      "below",
      // 'set-initial-position', 'group-leader',
      "title",
      "size-hints",
      "class-instance",
      "transient-for",
      "window-type",
      //"has-alpha",
      "decorations",
      "override-redirect",
      //"tray",
      "modal",
      //"opacity"
      // 'shadow', 'desktop',
    ],

    // Sound
    "sound.receive": false, // TODO: not implemented at all right now.
    "sound.send": false,
    "sound.server_driven": true,
    "sound.bundle-metadata": true,

    // encoding stuff
    keyboard: config.keyboard,
    xkbmap_layout: config.xkbmap_layout || "us", // default, but will get changed quickly on mount.
    xkbmap_keycodes: keycodes,
    xkbmap_print: "",
    xkbmap_query: "",

    // Screen
    desktop_size: config.screen,
    desktop_mode_size: config.screen,
    screen_sizes: calculateScreens(
      config.screen[0],
      config.screen[1],
      config.dpi
    ),
    dpi: config.dpi,

    // Clipboard
    clipboard_enabled: config.clipboard,
    "clipboard.want_targets": true,
    "clipboard.greedy": true,
    "clipboard.selections": ["CLIPBOARD", "PRIMARY"],

    // Notifications
    notifications: config.notifications,
    "notifications.close": true,
    "notifications.actions": true,
  };
}

export function getCapabilities(config, soundCodecs) {
  const platform = getPlatform();
  const browser = getBrowser();
  const client = getClientCapabilities(config);
  const encoding = getEncodingCapabilities(config, soundCodecs);

  const extras = {
    /*
     challenge: false,
    'bandwidth-limit': 0
      "connection-data"	: ci,
      "start-new-session" : this.start_new_session});
      "cipher"					: this.encryption,
      "cipher.iv"					: Utilities.getHexUUID().slice(0, 16),
      "cipher.key_salt"			: Utilities.getHexUUID()+Utilities.getHexUUID(),
      "cipher.key_stretch_iterations"	: 1000,
      "cipher.padding.options"	: ["PKCS#7"],
     */
  };

  return Object.assign(
    {
      version: "2.4",
      platform: platform.type,
      "platform.name": platform.name,
      "patform.processor": platform.processor,
      "platform.platform": platform.platform,
      "session-type": browser.name,
      "session-type.full": browser.agent,
      namespace: true,
      client_type: "HTML5",
      username: config.username,
      uuid: config.uuid,
      argv: [window.location.href],

      // Compression bits
      zlib: config.zlib,
      lzi: false,
      lz4: config.lz4,
      "encoding.rgb_lz4": true,
      "lz4.js.version": (window as any).lz4.version,
      compression_level: config.compression_level,

      // Packet encoders
      rencode: false,
      bencode: true,
      yaml: false,
      "open-url": true,
    },
    client,
    encoding,
    extras
  );
}
