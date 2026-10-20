package com.matneo.omm;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Open Materia Medica — offline Android wrapper.
 *
 * The whole site (364 pages) is bundled under assets/site and loaded from
 * file:///android_asset/. Nothing is fetched from the network, so the app works
 * with no connection at all.
 *
 * The site's own service worker is deliberately inert here: it registers only
 * when the protocol is http(s), so on file:// it never runs. Offline behaviour
 * comes from the files simply being on the device.
 */
public class MainActivity extends Activity {

    private static final String START = "file:///android_asset/site/index.html";

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);      // search, quiz, theme toggle
        s.setDomStorageEnabled(true);      // the site stores theme + mood
        s.setAllowFileAccess(true);
        s.setBuiltInZoomControls(false);
        s.setSupportZoom(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        web.setWebViewClient(new WebViewClient());
        web.setBackgroundColor(0xFFFBF7F0);

        if (saved != null) {
            web.restoreState(saved);
        } else {
            web.loadUrl(START);
        }
        setContentView(web);
    }

    /** Hardware back walks the site's history before leaving the app. */
    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(code, e);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) {
            web.saveState(out);
        }
    }
}
