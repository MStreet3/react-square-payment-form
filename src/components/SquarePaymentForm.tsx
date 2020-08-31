import React, { useState, useEffect } from 'react';

import useDynamicCallback from '../hooks/useDynamicCallback';

import Context from './Context';

import {
  SqError,
  SqCardData,
  SqContact,
  SqMethods,
  SqPaymentRequest,
  SqShippingOption,
  SqPaymentFormConfiguration,
  SqVerificationResult,
  SqVerificationDetails,
} from './models';

declare class SqPaymentForm {
  constructor(configuration: SqPaymentFormConfiguration);

  build: () => void;
  destroy: () => void;
  recalculateSize: () => void;
  requestCardNonce: () => void;
  verifyBuyer: (
    source: string,
    verificationDetails: SqVerificationDetails,
    callback: (err: SqError, verificationResult: SqVerificationResult) => void
  ) => void;
}

interface Props {
  /** <b>Required for all features</b><br/><br/>Identifies the calling form with a verified application ID generated from the Square Application Dashboard */
  applicationId: string;
  /** <b>Required for all features</b><br/><br/>Identifies the location of the merchant that is taking the payment. Obtained from the Square Application Dashboard - Locations tab.*/
  locationId: string;
  /** <b>Required for all features</b><br/><br/>Identifies the DOM form element*/
  formId: string;
  /** Define the internal styles applied to the rendered iframes */
  inputStyles?: {}[];
  /** Define the CSS class of input iframe elements */
  inputClass?: string;
  /** Internal variable: used for logs */
  apiWrapper: string;
  /** Enables Sandbox mode */
  sandbox: boolean;
  /** Square payment form components */
  children?: React.ReactNode;
  /** Change the placeholder for the CVV input */
  placeholderCVV?: string;
  /** Change the placeholder for the postal code input */
  placeholderPostal?: string;
  /** Change the placeholder for the credit card input */
  placeholderCreditCard?: string;
  /** Change the placeholder for the expiration date input */
  placeholderExpiration?: string;
  /** Change the placeholder for the gift card input */
  placeholderGiftCard?: string;

  /** <b>Required for all features</b><br/><br/>Invoked when payment form receives the result of a nonce generation request. The result will be a valid credit card or wallet nonce, or an error.*/
  cardNonceResponseReceived: (
    errors: [SqError],
    nonce: string,
    cardData: SqCardData,
    buyerVerificationToken?: string,
    billingContact?: SqContact,
    shippingContact?: SqContact,
    shippingOption?: SqShippingOption
  ) => void;
  /** <b>Required for digital wallets</b><br/><br/>Invoked when a digital wallet payment button is clicked.*/
  createPaymentRequest?: () => SqPaymentRequest;
  /** <b>Required for SCA</b><br/><br/> */
  createVerificationDetails?: () => SqVerificationDetails;
  /* Triggered when the page renders to decide which, if any, digital wallet button should be rendered in the payment form */
  methodsSupported?: (methods: SqMethods) => void;
  /** Invoked when visitors interact with the iframe elements */
  inputEventReceived?: () => void;
  /** Invoked when payment form is fully loaded */
  paymentFormLoaded?: () => void;
  /** Invoked when requestShippingAddress is true in PaymentRequest and the buyer selects a shipping address in the Apple Pay sheet or enters a new shipping address.*/
  shippingContactChanged?: (shippingContact: SqContact, done: ({}) => {}) => void;
  /** Invoked when the buyer selects a shipping option in the Apple Pay sheet. */
  shippingOptionChanged?: (shippingOption: SqShippingOption, done: ({}) => {}) => void;
  /** Invoked when the payment form is hosted in an unsupported browser */
  unsupportedBrowserDetected?: () => void;
}

interface State {
  applePayState: string;
  googlePayState: string;
  masterpassState: string;
  errorMessage?: string;
  scriptLoaded: boolean;
}

/**
 * Creates a Square Payment Form and renders form inputs to use inside of it.
 *
 * This component requires 3 arguments for basic use:
 * * **applicationId**: This can be found in your [Square Developer Dashboard](https://developer.squareup.com/apps)
 * for the current Square app you're developing
 * * **locationId**: You can retrieve this from the [Square Connect v2 Locations API](https://docs.connect.squareup.com/api/connect/v2#navsection-locations);
 * or your [Square Developer Dashboard](https://developer.squareup.com/apps).
 * It determines which Square location will receive credit for payments made with this form.
 * * **cardNonceResponseReceived**: This callback gives you a nonce to pass to your back-end server to make a "charge" request to Square.
 * * **createVerificationDetails**: This callback returns data used for [Strong Customer Authentication](https://developer.squareup.com/docs/sca-overview)
 *
 * ...and one additional argument for digital wallets:
 * * **createPaymentRequest**: This callback returns data to show information about the payment in the Apple Pay, Google Pay, and Masterpass interfaces.
 *
 * Please view the [Payment Form Data Models](https://docs.connect.squareup.com/api/paymentform) for additional information.
 */
export const SquarePaymentForm: React.FC<Props> = (props: Props) => {
  const [applePayState, setApplePayState] = useState('loading');
  const [googlePayState, setGooglePayState] = useState('loading');
  const [masterpassState, setMasterpassState] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [paymentForm, setPaymentForm] = useState<SqPaymentForm | undefined>(undefined);

  function cardNonceResponseReceived(
    errors: [SqError],
    nonce: string,
    cardData: SqCardData,
    billingContact: SqContact,
    shippingContact: SqContact,
    shippingOption: SqShippingOption
  ): void {
    if (errors || !props.createVerificationDetails) {
      props.cardNonceResponseReceived(errors, nonce, cardData, '', billingContact, shippingContact, shippingOption);
      return;
    }

    paymentForm &&
      paymentForm.verifyBuyer(
        nonce,
        props.createVerificationDetails(),
        (err: SqError, result: SqVerificationResult) => {
          props.cardNonceResponseReceived(
            [err],
            nonce,
            cardData,
            result ? result.token : undefined,
            billingContact,
            shippingContact,
            shippingOption
          );
        }
      );
  }

  // Fixes stale closure issue with using React Hooks & SqPaymentForm callback functions
  // https://github.com/facebook/react/issues/16956
  const cardNonceResponseReceivedCallback = useDynamicCallback(cardNonceResponseReceived);

  function createNonce(): void {
    paymentForm && paymentForm.requestCardNonce();
  }

  function verifyBuyer(
    source: string,
    verificationDetails: SqVerificationDetails,
    callback: (err: SqError, verificationResult: SqVerificationResult) => void
  ): void {
    paymentForm && paymentForm.verifyBuyer(source, verificationDetails, callback);
  }

  function methodsSupported(methods: SqMethods): void {
    const keys = Object.keys(methods);

    if (keys.includes('masterpass')) {
      setMasterpassState(methods.masterpass === true ? 'ready' : 'unavailable');
    }
    if (keys.includes('applePay')) {
      setApplePayState(methods.applePay === true ? 'ready' : 'unavailable');
    }
    if (keys.includes('googlePay')) {
      setGooglePayState(methods.googlePay === true ? 'ready' : 'unavailable');
    }
  }

  function paymentFormLoaded(): void {
    paymentForm && paymentForm.recalculateSize();
    props.paymentFormLoaded && props.paymentFormLoaded();
  }

  function loadSqPaymentFormLibrary(onSuccess?: () => void, onError?: () => void): void {
    if (document.getElementById('sq-payment-form-script') && typeof SqPaymentForm === 'function') {
      onSuccess && onSuccess();
      return;
    }
    const script = document.createElement('script');
    script.id = 'sq-payment-form-script';
    if (props.sandbox) {
      script.src = 'https://js.squareupsandbox.com/v2/paymentform';
    } else {
      script.src = 'https://js.squareup.com/v2/paymentform';
    }
    script.onload = function() {
      onSuccess && onSuccess();
    };
    script.onerror = function() {
      onError && onError();
    };
  }

  function buildSqPaymentFormConfiguration(props: Props): SqPaymentFormConfiguration {
    const config: SqPaymentFormConfiguration = {
      apiWrapper: props.apiWrapper,
      applicationId: props.applicationId,
      autoBuild: false,
      callbacks: {
        // @ts-ignore: Always true error
        cardNonceResponseReceived: props.cardNonceResponseReceived ? cardNonceResponseReceivedCallback : null, // handles missing callback error
        createPaymentRequest: props.createPaymentRequest,
        inputEventReceived: props.inputEventReceived,
        methodsSupported: props.methodsSupported,
        paymentFormLoaded,
        shippingContactChanged: props.shippingContactChanged,
        shippingOptionChanged: props.shippingOptionChanged,
        unsupportedBrowserDetected: props.unsupportedBrowserDetected,
      },
      locationId: props.locationId,
    };

    // "The SqPaymentForm object in single-element payment form mode does not support digital wallets."
    // https://developer.squareup.com/docs/payment-form/payment-form-walkthrough#single-element-payment-form-and-digital-wallet-support
    if (document.getElementById(`${props.formId}-sq-card`)) {
      config.card = {
        elementId: `${props.formId}-sq-card`,
        inputStyle: props.inputStyles && props.inputStyles[0],
      };
    } else if (document.getElementById(`${props.formId}-sq-gift-card`)) {
      config.giftCard = {
        elementId: `${props.formId}-sq-gift-card`,
        placeholder: props.placeholderGiftCard || '• • • •  • • • •  • • • •  • • • •',
      };
      config.inputClass = props.inputClass || 'sq-input';
      config.inputStyles = props.inputStyles;
    } else {
      config.inputClass = props.inputClass || 'sq-input';
      config.inputStyles = props.inputStyles;

      if (document.getElementById(`${props.formId}-sq-apple-pay`)) {
        config.applePay = { elementId: `${props.formId}-sq-apple-pay` };
      }
      if (document.getElementById(`${props.formId}-sq-google-pay`)) {
        config.googlePay = { elementId: `${props.formId}-sq-google-pay` };
      }
      if (document.getElementById(`${props.formId}-sq-masterpass`)) {
        config.masterpass = { elementId: `${props.formId}-sq-masterpass` };
      }

      if (document.getElementById(`${props.formId}-sq-card-number`)) {
        config.cardNumber = {
          elementId: `${props.formId}-sq-card-number`,
          placeholder: props.placeholderCreditCard || '• • • •  • • • •  • • • •  • • • •',
        };
      }
      if (document.getElementById(`${props.formId}-sq-cvv`)) {
        config.cvv = { elementId: `${props.formId}-sq-cvv`, placeholder: props.placeholderCVV || 'CVV ' };
      }
      if (document.getElementById(`${props.formId}-sq-postal-code`)) {
        config.postalCode = {
          elementId: `${props.formId}-sq-postal-code`,
          placeholder: props.placeholderPostal || '12345',
        };
      } else {
        config.postalCode = false;
      }
      if (document.getElementById(`${props.formId}-sq-expiration-date`)) {
        config.expirationDate = {
          elementId: `${props.formId}-sq-expiration-date`,
          placeholder: props.placeholderExpiration || 'MM/YY',
        };
      }
    }
    return config;
  }

  function renderSqPaymentForm(): void {
    if (!scriptLoaded || paymentForm || errorMessage.length > 0) {
      return;
    }
    try {
      const newPaymentForm = new SqPaymentForm(buildSqPaymentFormConfiguration({ methodsSupported, ...props }));
      newPaymentForm.build();
      setPaymentForm(newPaymentForm);
    } catch (error) {
      const errorMesasge = error.message || 'Unable to build Square payment form';
      setErrorMessage(errorMesasge);
    }
  }

  useEffect(() => {
    loadSqPaymentFormLibrary(
      () => setScriptLoaded(true),
      () => setErrorMessage('Unable to load Square payment library')
    );
  }, []);

  useEffect(() => {
    renderSqPaymentForm();
    return () => {
      if (paymentForm) {
        paymentForm.destroy();
        setPaymentForm(undefined);
      }
    };
  }, [scriptLoaded]);

  if (errorMessage) {
    return (
      <div className="sq-payment-form">
        <div className="sq-error-message">{errorMessage}</div>
      </div>
    );
  }

  const context = {
    applePayState,
    formId: props.formId,
    googlePayState,
    masterpassState,
    onCreateNonce: createNonce,
    onVerifyBuyer: verifyBuyer,
  };

  return (
    <Context.Provider value={context}>
      <div id={props.formId} className="sq-payment-form">
        {props.children}
      </div>
    </Context.Provider>
  );
};

SquarePaymentForm.defaultProps = {
  apiWrapper: 'reactjs/0.6.3',
  formId: 'sq-payment-form',
  inputStyles: [
    {
      _mozOsxFontSmoothing: 'grayscale',
      _webkitFontSmoothing: 'antialiased',
      backgroundColor: 'transparent',
      color: '#373F4A',
      fontFamily: 'Helvetica Neue',
      fontSize: '16px',
      lineHeight: '24px',
      padding: '16px',
      placeholderColor: '#CCC',
    },
  ],
  sandbox: false,
};
